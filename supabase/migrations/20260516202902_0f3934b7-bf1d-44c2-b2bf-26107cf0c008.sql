-- Phase 2c: Finance → HR payment back-sync
-- finance_mark_benefit_paid: Finance becomes the payment authority.
-- Sets the linked financial_expense_items row to 'paid' and routes the
-- benefit_expenses transition through the existing state machine.

CREATE OR REPLACE FUNCTION public.finance_mark_benefit_paid(
  p_finance_item_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor      uuid := auth.uid();
  v_fei        public.financial_expense_items;
  v_paid_date  date;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Admin-only execution. Finance payment authority is admin-gated for now.
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

  v_paid_date := COALESCE(v_fei.paid_date, CURRENT_DATE);

  UPDATE public.financial_expense_items
     SET status     = 'paid',
         paid_date  = v_paid_date,
         updated_at = now()
   WHERE id = p_finance_item_id;

  -- Route HR transition through the existing state machine (audit + RLS).
  PERFORM public.benefit_expense_set_status(
    v_fei.source_ref_id,
    'paga'::public.expense_status,
    NULL
  );

  -- Finance-driven audit event (in addition to the 'paid' event written by
  -- benefit_expense_set_status' downstream history triggers).
  INSERT INTO public.benefit_expense_events (
    expense_id, actor_id, event_type, metadata
  ) VALUES (
    v_fei.source_ref_id,
    v_actor,
    'finance_paid',
    jsonb_build_object(
      'finance_item_id', p_finance_item_id,
      'paid_date',       v_paid_date
    )
  );

  RETURN p_finance_item_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finance_mark_benefit_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_mark_benefit_paid(uuid) TO authenticated;