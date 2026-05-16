-- Phase 2b: HR Benefits → Finance write-through on approval
-- Synthetic supplier and backlink columns were created in Phase 2a.

-- Helper: link an approved HR benefit expense to a finance expense item
CREATE OR REPLACE FUNCTION public.benefit_expense_link_to_finance(p_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_exp        public.benefit_expenses;
  v_existing   uuid;
  v_supplier   uuid;
  v_collab_nm  text;
  v_cat_label  text;
  v_due        date;
  v_period     uuid;
  v_new_id     uuid;
BEGIN
  SELECT * INTO v_exp FROM public.benefit_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'benefit expense % not found', p_expense_id;
  END IF;

  IF v_exp.estado <> 'aprovada' THEN
    RAISE EXCEPTION 'benefit expense % not in aprovada state', p_expense_id;
  END IF;

  -- Idempotency: return existing link if present
  SELECT id INTO v_existing
  FROM public.financial_expense_items
  WHERE source_ref_table = 'benefit_expenses'
    AND source_ref_id    = p_expense_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Resolve synthetic supplier
  SELECT id INTO v_supplier
  FROM public.companies
  WHERE nome = 'Reembolsos a Colaboradores' AND is_supplier = true
  LIMIT 1;

  -- Description bits
  SELECT nome INTO v_collab_nm FROM public.collaborators WHERE id = v_exp.collaborator_id;
  SELECT COALESCE(c.label_pt, lc.label_pt, v_exp.categoria::text)
    INTO v_cat_label
    FROM (SELECT 1) s
    LEFT JOIN public.benefit_categories c ON c.id = v_exp.category_id
    LEFT JOIN public.benefit_category_legacy_aliases la ON la.legacy_enum = v_exp.categoria
    LEFT JOIN public.benefit_categories lc ON lc.id = la.category_id;

  -- Due date = last day of the expense month
  v_due := (date_trunc('month', v_exp.data_despesa) + INTERVAL '1 month - 1 day')::date;

  -- Period if it exists and is not closed
  SELECT id INTO v_period
  FROM public.financial_periods
  WHERE year = EXTRACT(YEAR FROM v_due)::int
    AND month = EXTRACT(MONTH FROM v_due)::int
    AND is_closed = false
  LIMIT 1;

  INSERT INTO public.financial_expense_items (
    supplier_id, period_id, due_date, description,
    expense_type, status,
    amount_ex_vat, vat_rate, actual_amount_inc_vat,
    source_ref_table, source_ref_id, created_by
  ) VALUES (
    v_supplier, v_period, v_due,
    format('Reembolso benefícios — %s — %s', COALESCE(v_collab_nm, '?'), COALESCE(v_cat_label, '?')),
    'operational', 'confirmed',
    v_exp.valor, 0, v_exp.valor,
    'benefit_expenses', p_expense_id, auth.uid()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.benefit_expense_events (expense_id, actor_id, event_type, metadata)
  VALUES (
    p_expense_id, auth.uid(), 'finance_linked',
    jsonb_build_object(
      'finance_item_id', v_new_id,
      'finance_status', 'confirmed',
      'due_date', v_due,
      'period_id', v_period
    )
  );

  RETURN v_new_id;
END;
$fn$;

-- Helper: cancel the linked finance row when an approved benefit is later rejected
CREATE OR REPLACE FUNCTION public.benefit_expense_cancel_finance_link(p_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_fei_id uuid;
BEGIN
  SELECT id INTO v_fei_id
  FROM public.financial_expense_items
  WHERE source_ref_table = 'benefit_expenses'
    AND source_ref_id    = p_expense_id
  LIMIT 1;

  IF v_fei_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.financial_expense_items
     SET status = 'cancelled', updated_at = now()
   WHERE id = v_fei_id
     AND status <> 'cancelled';

  INSERT INTO public.benefit_expense_events (expense_id, actor_id, event_type, metadata)
  VALUES (
    p_expense_id, auth.uid(), 'finance_cancelled',
    jsonb_build_object('finance_item_id', v_fei_id)
  );

  RETURN v_fei_id;
END;
$fn$;

-- Trigger: react to status changes on benefit_expenses
CREATE OR REPLACE FUNCTION public.benefit_expense_finance_sync_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'aprovada' AND OLD.estado <> 'aprovada' THEN
      PERFORM public.benefit_expense_link_to_finance(NEW.id);
    ELSIF NEW.estado = 'rejeitada' AND OLD.estado = 'aprovada' THEN
      PERFORM public.benefit_expense_cancel_finance_link(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_benefit_expense_finance_sync ON public.benefit_expenses;
CREATE TRIGGER trg_benefit_expense_finance_sync
  AFTER UPDATE OF estado ON public.benefit_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.benefit_expense_finance_sync_trg();

-- Lock down direct execution: only callable via trigger / definer chain
REVOKE ALL ON FUNCTION public.benefit_expense_link_to_finance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.benefit_expense_cancel_finance_link(uuid) FROM PUBLIC, anon, authenticated;