-- ============================================================
-- Phase 2d.1.1 — Backfill payment ledger for already-paid
-- HR benefit reimbursement financial_expense_items.
-- ============================================================

-- ---------- Preview ----------
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
           COALESCE(fei.actual_amount_inc_vat, fei.expected_amount_inc_vat, 0) AS amount,
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

REVOKE ALL ON FUNCTION public.financial_expense_payment_backfill_preview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_expense_payment_backfill_preview() TO authenticated;

-- ---------- Run ----------
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
           fei.expected_amount_inc_vat,
           fei.paid_date,
           fei.status
      FROM public.financial_expense_items fei
      JOIN public.benefit_expenses be ON be.id = fei.source_ref_id
     WHERE fei.source_ref_table = 'benefit_expenses'
       AND fei.status = 'paid'
  LOOP
    BEGIN
      -- Idempotency guard (also enforced by NOT EXISTS in select, but rechecked
      -- here in case of concurrent runs).
      IF EXISTS (
        SELECT 1 FROM public.financial_expense_payments fep
         WHERE fep.expense_item_id = v_row.fei_id
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_amount := COALESCE(v_row.actual_amount_inc_vat, v_row.expected_amount_inc_vat, 0);
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

REVOKE ALL ON FUNCTION public.financial_expense_payment_backfill_run() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_expense_payment_backfill_run() TO authenticated;
