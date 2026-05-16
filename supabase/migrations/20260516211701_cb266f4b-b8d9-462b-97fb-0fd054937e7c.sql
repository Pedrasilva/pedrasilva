CREATE OR REPLACE FUNCTION public.hr_dashboard_alerts_finance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_approved_no_fei int := 0;
  v_fei_paid_hr_not_paga int := 0;
  v_sync_failed int := 0;
  v_no_period int := 0;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_permission(v_uid, 'finance.dashboard')
  ) THEN
    RETURN jsonb_build_object(
      'approved_no_fei', 0,
      'fei_paid_hr_not_paga', 0,
      'sync_failed', 0,
      'no_period', 0
    );
  END IF;

  SELECT COUNT(*) INTO v_approved_no_fei
    FROM public.benefit_expenses be
   WHERE be.estado = 'aprovada'
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_expense_items fei
        WHERE fei.source_ref_table = 'benefit_expenses'
          AND fei.source_ref_id = be.id
     );

  SELECT COUNT(*) INTO v_fei_paid_hr_not_paga
    FROM public.financial_expense_items fei
    JOIN public.benefit_expenses be ON be.id = fei.source_ref_id
   WHERE fei.source_ref_table = 'benefit_expenses'
     AND fei.status = 'paid'
     AND be.estado <> 'paga';

  SELECT COUNT(*) INTO v_sync_failed
    FROM public.benefit_expense_events
   WHERE event_type = 'finance_paid_hr_sync_failed';

  SELECT COUNT(*) INTO v_no_period
    FROM public.financial_expense_items fei
   WHERE fei.source_ref_table = 'benefit_expenses'
     AND fei.period_id IS NULL
     AND fei.status <> 'cancelled';

  RETURN jsonb_build_object(
    'approved_no_fei', v_approved_no_fei,
    'fei_paid_hr_not_paga', v_fei_paid_hr_not_paga,
    'sync_failed', v_sync_failed,
    'no_period', v_no_period
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.hr_dashboard_alerts_finance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_dashboard_alerts_finance() TO authenticated;