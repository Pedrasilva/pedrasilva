-- ============================================================
-- Phase 2d.2 — Manual reconciliation helpers
-- ============================================================

-- ---------- Fix 2d.1.1 backfill RPCs (wrong column name) ----------
CREATE OR REPLACE FUNCTION public.financial_expense_payment_backfill_preview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH eligible AS (
    SELECT fei.id,
           COALESCE(fei.actual_amount_inc_vat, fei.amount_inc_vat, fei.amount_ex_vat, 0) AS amount,
           COALESCE(fei.paid_date, CURRENT_DATE) AS pay_date
      FROM public.financial_expense_items fei
      JOIN public.benefit_expenses be ON be.id = fei.source_ref_id
     WHERE fei.source_ref_table = 'benefit_expenses'
       AND fei.status = 'paid'
       AND NOT EXISTS (
         SELECT 1 FROM public.financial_expense_payments fep
          WHERE fep.expense_item_id = fei.id
       )
  )
  SELECT jsonb_build_object(
    'eligible',     COUNT(*),
    'total_amount', COALESCE(SUM(amount), 0),
    'oldest_date',  MIN(pay_date),
    'newest_date',  MAX(pay_date)
  ) INTO v_result
  FROM eligible;

  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.financial_expense_payment_backfill_run()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_failed    integer := 0;
  v_failures  jsonb   := '[]'::jsonb;
  v_row       record;
  v_amount    numeric(14,2);
  v_pay_date  date;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  FOR v_row IN
    SELECT fei.id              AS fei_id,
           fei.actual_amount_inc_vat,
           fei.amount_inc_vat,
           fei.amount_ex_vat,
           fei.paid_date
      FROM public.financial_expense_items fei
      JOIN public.benefit_expenses be ON be.id = fei.source_ref_id
     WHERE fei.source_ref_table = 'benefit_expenses'
       AND fei.status = 'paid'
  LOOP
    BEGIN
      IF EXISTS (
        SELECT 1 FROM public.financial_expense_payments fep
         WHERE fep.expense_item_id = v_row.fei_id
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_amount := COALESCE(v_row.actual_amount_inc_vat, v_row.amount_inc_vat, v_row.amount_ex_vat, 0);
      IF v_amount <= 0 THEN
        v_failed := v_failed + 1;
        v_failures := v_failures || jsonb_build_object(
          'expense_id', v_row.fei_id,
          'sqlstate',   'P0001',
          'message',    'non-positive amount'
        );
        CONTINUE;
      END IF;

      v_pay_date := COALESCE(v_row.paid_date, CURRENT_DATE);

      INSERT INTO public.financial_expense_payments (
        expense_item_id, bank_transaction_id, amount, payment_date,
        method, notes, created_by
      ) VALUES (
        v_row.fei_id, NULL, v_amount, v_pay_date,
        'bank_transfer',
        'Backfilled payment ledger row for previously paid HR benefit reimbursement',
        v_uid
      );

      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_object(
        'expense_id', v_row.fei_id,
        'sqlstate',   SQLSTATE,
        'message',    SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'created',  v_created,
    'skipped',  v_skipped,
    'failed',   v_failed,
    'failures', v_failures
  );
END;
$fn$;

-- ---------- finance_settle_expense ----------
CREATE OR REPLACE FUNCTION public.finance_settle_expense(
  p_expense_item_id     uuid,
  p_bank_transaction_id uuid,
  p_amount              numeric,
  p_payment_date        date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid         uuid := auth.uid();
  v_fei         record;
  v_tx_exists   boolean;
  v_already_sum numeric(14,2);
  v_expected    numeric(14,2);
  v_payment_id  uuid;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_permission(v_uid, 'finance.dashboard')
  ) THEN
    RAISE EXCEPTION 'forbidden: admin or finance role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_expense_item_id IS NULL OR p_bank_transaction_id IS NULL THEN
    RAISE EXCEPTION 'expense_item_id and bank_transaction_id are required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'payment_date is required';
  END IF;

  SELECT id, status, actual_amount_inc_vat, amount_inc_vat, amount_ex_vat
    INTO v_fei
    FROM public.financial_expense_items
   WHERE id = p_expense_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense item % not found', p_expense_item_id;
  END IF;
  IF v_fei.status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot settle cancelled expense item %', p_expense_item_id;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.bank_transactions WHERE id = p_bank_transaction_id)
    INTO v_tx_exists;
  IF NOT v_tx_exists THEN
    RAISE EXCEPTION 'bank transaction % not found', p_bank_transaction_id;
  END IF;

  v_expected := COALESCE(v_fei.actual_amount_inc_vat, v_fei.amount_inc_vat, v_fei.amount_ex_vat, 0);

  SELECT COALESCE(SUM(amount), 0) INTO v_already_sum
    FROM public.financial_expense_payments
   WHERE expense_item_id = p_expense_item_id;

  IF v_expected > 0 AND v_already_sum >= v_expected THEN
    RAISE EXCEPTION 'expense item % is already fully settled', p_expense_item_id;
  END IF;

  INSERT INTO public.financial_expense_payments (
    expense_item_id, bank_transaction_id, amount, payment_date,
    method, notes, created_by
  ) VALUES (
    p_expense_item_id, p_bank_transaction_id, p_amount, p_payment_date,
    'bank_transfer',
    'Settled via bank reconciliation',
    v_uid
  )
  RETURNING id INTO v_payment_id;

  -- The financial_expense_recalc_payment trigger updates FEI.status.
  -- The Finance → HR sync runs via the existing path the next time
  -- finance_mark_benefit_paid is invoked OR we can mirror status by
  -- calling benefit_expense_set_status if FEI just became paid.
  IF EXISTS (
    SELECT 1 FROM public.financial_expense_items fei
     WHERE fei.id = p_expense_item_id
       AND fei.status = 'paid'
       AND fei.source_ref_table = 'benefit_expenses'
  ) THEN
    BEGIN
      PERFORM public.benefit_expense_set_status(
        (SELECT source_ref_id FROM public.financial_expense_items WHERE id = p_expense_item_id),
        'paga'::public.expense_status,
        NULL
      );

      INSERT INTO public.benefit_expense_events (expense_id, event_type, metadata)
      SELECT fei.source_ref_id,
             'finance_paid',
             jsonb_build_object(
               'finance_item_id',     p_expense_item_id,
               'payment_id',          v_payment_id,
               'bank_transaction_id', p_bank_transaction_id,
               'amount',              p_amount,
               'bank_linked',         true,
               'via',                 'reconciliation'
             )
        FROM public.financial_expense_items fei
       WHERE fei.id = p_expense_item_id;
    EXCEPTION WHEN OTHERS THEN
      -- HR mirror is best-effort; payment row is already in place.
      NULL;
    END;
  END IF;

  RETURN v_payment_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finance_settle_expense(uuid, uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_settle_expense(uuid, uuid, numeric, date) TO authenticated;

-- ---------- Auto-classify bank tx on expense payment ----------
DROP TRIGGER IF EXISTS trg_fep_auto_classify_ins ON public.financial_expense_payments;
CREATE TRIGGER trg_fep_auto_classify_ins
AFTER INSERT ON public.financial_expense_payments
FOR EACH ROW
EXECUTE FUNCTION public.bank_tx_auto_classify_on_payment();

DROP TRIGGER IF EXISTS trg_fep_auto_classify_upd ON public.financial_expense_payments;
CREATE TRIGGER trg_fep_auto_classify_upd
AFTER UPDATE OF bank_transaction_id ON public.financial_expense_payments
FOR EACH ROW
WHEN (NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id)
EXECUTE FUNCTION public.bank_tx_auto_classify_on_payment();
