-- ============================================================
-- Phase 2d.1 — financial_expense_payments + recalc trigger
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financial_expense_payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_item_id      uuid NOT NULL
    REFERENCES public.financial_expense_items(id) ON DELETE CASCADE,
  bank_transaction_id  uuid
    REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  amount               numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date         date NOT NULL,
  method               public.financial_payment_method NOT NULL DEFAULT 'bank_transfer',
  notes                text,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fep_item ON public.financial_expense_payments(expense_item_id);
CREATE INDEX IF NOT EXISTS idx_fep_bank ON public.financial_expense_payments(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fep_date ON public.financial_expense_payments(payment_date);

-- Prevent linking the same bank tx to the same expense item twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fep_bank_item
  ON public.financial_expense_payments(bank_transaction_id, expense_item_id)
  WHERE bank_transaction_id IS NOT NULL;

ALTER TABLE public.financial_expense_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fep_read" ON public.financial_expense_payments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

CREATE POLICY "fep_write" ON public.financial_expense_payments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

CREATE TRIGGER trg_fep_updated_at
  BEFORE UPDATE ON public.financial_expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------
-- Guard: never accept payments against a cancelled expense item.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_expense_payment_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status public.financial_expense_status;
BEGIN
  SELECT status INTO v_status
    FROM public.financial_expense_items
   WHERE id = NEW.expense_item_id;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot record payment against cancelled expense item %', NEW.expense_item_id;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_fep_guard
  BEFORE INSERT OR UPDATE ON public.financial_expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.financial_expense_payment_guard();

-- ----------------------------------------------------------------
-- Recalc: sum payments → flip FEI.status
--   paid_sum >= expected_amount → status='paid', paid_date=max(payment_date)
--   paid_sum  = 0               → status reverts to 'confirmed' (was 'paid')
--   otherwise: leave status untouched (partial payments deferred to a
--   future phase; cancelled rows are never touched here either).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_expense_recalc_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_fei_id      uuid;
  v_paid_sum    numeric(14,2);
  v_max_date    date;
  v_expected    numeric(14,2);
  v_current     public.financial_expense_status;
BEGIN
  v_fei_id := COALESCE(NEW.expense_item_id, OLD.expense_item_id);

  SELECT status,
         COALESCE(actual_amount_inc_vat, amount_inc_vat, amount_ex_vat, 0)
    INTO v_current, v_expected
    FROM public.financial_expense_items
   WHERE id = v_fei_id;

  IF v_current = 'cancelled' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_paid_sum, v_max_date
    FROM public.financial_expense_payments
   WHERE expense_item_id = v_fei_id;

  IF v_paid_sum >= v_expected AND v_expected > 0 THEN
    UPDATE public.financial_expense_items
       SET status     = 'paid',
           paid_date  = v_max_date,
           updated_at = now()
     WHERE id = v_fei_id
       AND (status <> 'paid' OR paid_date IS DISTINCT FROM v_max_date);
  ELSIF v_paid_sum = 0 AND v_current = 'paid' THEN
    -- All payments removed: revert paid → confirmed.
    UPDATE public.financial_expense_items
       SET status     = 'confirmed',
           paid_date  = NULL,
           updated_at = now()
     WHERE id = v_fei_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

CREATE TRIGGER trg_fep_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.financial_expense_recalc_payment();

-- ----------------------------------------------------------------
-- Refactor finance_mark_benefit_paid: write through the ledger.
--   - Inserts a full-amount payment row (bank_transaction_id NULL).
--   - Recalc trigger flips FEI.status='paid'.
--   - Existing HR back-sync via benefit_expense_set_status preserved.
--   - finance_paid event metadata now includes payment_id + bank_linked.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_mark_benefit_paid(
  p_finance_item_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor       uuid := auth.uid();
  v_fei         public.financial_expense_items;
  v_paid_date   date;
  v_amount      numeric(14,2);
  v_payment_id  uuid;
  v_existing    numeric(14,2);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fei
    FROM public.financial_expense_items
   WHERE id = p_finance_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finance item % not found', p_finance_item_id;
  END IF;

  IF v_fei.source_ref_table IS DISTINCT FROM 'benefit_expenses'
     OR v_fei.source_ref_id IS NULL THEN
    RAISE EXCEPTION 'finance item % is not linked to a benefit expense', p_finance_item_id;
  END IF;

  IF v_fei.status = 'cancelled' THEN
    RAISE EXCEPTION 'finance item % is cancelled', p_finance_item_id;
  END IF;

  IF v_fei.status = 'paid' THEN
    RAISE EXCEPTION 'finance item % already paid', p_finance_item_id;
  END IF;

  v_amount := COALESCE(v_fei.actual_amount_inc_vat, v_fei.amount_inc_vat, v_fei.amount_ex_vat, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'finance item % has no payable amount', p_finance_item_id;
  END IF;

  -- Guard against any pre-existing partial payments inflating the total.
  SELECT COALESCE(SUM(amount), 0) INTO v_existing
    FROM public.financial_expense_payments
   WHERE expense_item_id = p_finance_item_id;

  v_amount    := v_amount - v_existing;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'finance item % already fully settled by existing payments', p_finance_item_id;
  END IF;

  v_paid_date := COALESCE(v_fei.paid_date, CURRENT_DATE);

  INSERT INTO public.financial_expense_payments (
    expense_item_id, bank_transaction_id, amount, payment_date, method, notes, created_by
  ) VALUES (
    p_finance_item_id, NULL, v_amount, v_paid_date, 'bank_transfer',
    'Marked paid via Finance (manual)', v_actor
  )
  RETURNING id INTO v_payment_id;
  -- recalc trigger now flips FEI.status='paid' & paid_date

  -- HR back-sync via the existing state machine.
  PERFORM public.benefit_expense_set_status(
    v_fei.source_ref_id,
    'paga'::public.expense_status,
    NULL
  );

  INSERT INTO public.benefit_expense_events (
    expense_id, actor_id, event_type, metadata
  ) VALUES (
    v_fei.source_ref_id,
    v_actor,
    'finance_paid',
    jsonb_build_object(
      'finance_item_id', p_finance_item_id,
      'payment_id',      v_payment_id,
      'paid_date',       v_paid_date,
      'amount',          v_amount,
      'bank_linked',     false
    )
  );

  RETURN p_finance_item_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finance_mark_benefit_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_mark_benefit_paid(uuid) TO authenticated;