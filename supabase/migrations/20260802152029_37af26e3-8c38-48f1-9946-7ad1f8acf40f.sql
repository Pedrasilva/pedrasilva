
-- 1. Reconciliation state on bank transactions
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid;

CREATE INDEX IF NOT EXISTS idx_bt_reconciled
  ON public.bank_transactions (bank_account_id, transaction_date)
  WHERE reconciled_at IS NOT NULL;

-- Backfill: anything already linked to a payment counts as reconciled
UPDATE public.bank_transactions bt
   SET reconciled_at = COALESCE(bt.classified_at, bt.created_at),
       reconciled_by = bt.classified_by
 WHERE bt.reconciled_at IS NULL
   AND (
     EXISTS (SELECT 1 FROM public.financial_document_payments p WHERE p.bank_transaction_id = bt.id)
     OR EXISTS (SELECT 1 FROM public.financial_expense_payments p WHERE p.bank_transaction_id = bt.id)
   );

-- 2. Mark reconciled when a payment link is created
CREATE OR REPLACE FUNCTION public.bank_tx_auto_classify_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bank_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.bank_transactions bt
     SET status = 'classified',
         classified_at = COALESCE(bt.classified_at, now()),
         classified_by = COALESCE(bt.classified_by, NEW.created_by),
         reconciled_at = COALESCE(bt.reconciled_at, now()),
         reconciled_by = COALESCE(bt.reconciled_by, NEW.created_by)
   WHERE bt.id = NEW.bank_transaction_id
     AND (bt.status IS DISTINCT FROM 'classified' OR bt.reconciled_at IS NULL);

  RETURN NEW;
END;
$$;

-- 3. Clear reconciliation when the last payment link is removed
CREATE OR REPLACE FUNCTION public.bank_tx_unreconcile_on_payment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.bank_transaction_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
        SELECT 1 FROM public.financial_document_payments p
         WHERE p.bank_transaction_id = OLD.bank_transaction_id
           AND p.id <> OLD.id
      )
     AND NOT EXISTS (
        SELECT 1 FROM public.financial_expense_payments p
         WHERE p.bank_transaction_id = OLD.bank_transaction_id
           AND p.id <> OLD.id
      )
  THEN
    UPDATE public.bank_transactions bt
       SET reconciled_at = NULL,
           reconciled_by = NULL
     WHERE bt.id = OLD.bank_transaction_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_tx_unreconcile_fdp ON public.financial_document_payments;
CREATE TRIGGER trg_bank_tx_unreconcile_fdp
AFTER DELETE ON public.financial_document_payments
FOR EACH ROW EXECUTE FUNCTION public.bank_tx_unreconcile_on_payment_delete();

DROP TRIGGER IF EXISTS trg_bank_tx_unreconcile_fep ON public.financial_expense_payments;
CREATE TRIGGER trg_bank_tx_unreconcile_fep
AFTER DELETE ON public.financial_expense_payments
FOR EACH ROW EXECUTE FUNCTION public.bank_tx_unreconcile_on_payment_delete();

-- 4. Lock reconciled transactions (raw fields already immutable)
CREATE OR REPLACE FUNCTION public.bank_tx_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_allow_account_move boolean := false;
BEGIN
  BEGIN
    v_allow_account_move := current_setting('app.allow_bank_tx_account_move', true) = 'on';
  EXCEPTION WHEN OTHERS THEN
    v_allow_account_move := false;
  END;

  IF (NOT v_allow_account_move) AND NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id THEN
    RAISE EXCEPTION 'bank_transactions.bank_account_id is immutable outside the move-import flow';
  END IF;

  IF NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
     OR NEW.value_date IS DISTINCT FROM OLD.value_date
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.running_balance IS DISTINCT FROM OLD.running_balance
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.row_checksum IS DISTINCT FROM OLD.row_checksum
     OR NEW.statement_import_id IS DISTINCT FROM OLD.statement_import_id
  THEN
    RAISE EXCEPTION 'Raw imported bank transaction fields are immutable. Edit classification or status only.';
  END IF;

  -- Reconciled rows are locked: unreconcile first.
  IF OLD.reconciled_at IS NOT NULL AND NEW.reconciled_at IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.suggested_classification_id IS DISTINCT FROM OLD.suggested_classification_id
    THEN
      RAISE EXCEPTION 'This bank transaction is reconciled and locked. Unreconcile it before editing.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bank_tx_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.reconciled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This bank transaction is reconciled and locked. Unreconcile it before deleting.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_bt_guard_delete ON public.bank_transactions;
CREATE TRIGGER trg_bt_guard_delete
BEFORE DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.bank_tx_guard_delete();

-- 5. Shared calculated balance
CREATE OR REPLACE FUNCTION public.bank_account_calculated_balance(
  _account_id uuid,
  _as_of date DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(a.opening_balance, 0)
       + COALESCE((
           SELECT SUM(bt.amount)
             FROM public.bank_transactions bt
            WHERE bt.bank_account_id = a.id
              AND bt.reconciled_at IS NOT NULL
              AND (_as_of IS NULL OR bt.transaction_date <= _as_of)
              AND (a.opening_balance_date IS NULL OR bt.transaction_date > a.opening_balance_date)
         ), 0)
    FROM public.bank_accounts a
   WHERE a.id = _account_id;
$$;

CREATE OR REPLACE FUNCTION public.bank_calculated_balances(_as_of date DEFAULT NULL)
RETURNS TABLE (
  bank_account_id uuid,
  opening_balance numeric,
  reconciled_total numeric,
  reconciled_count integer,
  calculated_balance numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT a.id,
         COALESCE(a.opening_balance, 0),
         COALESCE(m.total, 0),
         COALESCE(m.cnt, 0),
         COALESCE(a.opening_balance, 0) + COALESCE(m.total, 0)
    FROM public.bank_accounts a
    LEFT JOIN LATERAL (
      SELECT SUM(bt.amount) AS total, COUNT(*)::int AS cnt
        FROM public.bank_transactions bt
       WHERE bt.bank_account_id = a.id
         AND bt.reconciled_at IS NOT NULL
         AND (_as_of IS NULL OR bt.transaction_date <= _as_of)
         AND (a.opening_balance_date IS NULL OR bt.transaction_date > a.opening_balance_date)
    ) m ON true;
$$;

GRANT EXECUTE ON FUNCTION public.bank_account_calculated_balance(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bank_calculated_balances(date) TO authenticated;

-- 6. Explicit unreconcile action
CREATE OR REPLACE FUNCTION public.bank_tx_unreconcile(_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'financial.manage')) THEN
    RAISE EXCEPTION 'Not authorised to unreconcile bank transactions';
  END IF;

  DELETE FROM public.financial_document_payments WHERE bank_transaction_id = _tx_id;
  DELETE FROM public.financial_expense_payments WHERE bank_transaction_id = _tx_id;

  UPDATE public.bank_transactions
     SET reconciled_at = NULL,
         reconciled_by = NULL,
         status = 'unclassified',
         classified_at = NULL,
         classified_by = NULL
   WHERE id = _tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bank_tx_unreconcile(uuid) TO authenticated;
