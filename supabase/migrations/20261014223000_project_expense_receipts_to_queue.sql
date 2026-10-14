-- see file
INSERT INTO public.financial_classifications
  (entity_id, code, name_pt, name_en, parent_id, level,
   financial_nature, spending_policy, affects_profit, affects_cash_flow,
   cost_category_id, sort_order, active)
SELECT g.entity_id, 'PRJ.EXP', 'Despesas de projeto', 'Project expenses', g.id,
  'category', g.financial_nature, g.spending_policy, true, true,
  g.cost_category_id, 1003, true
FROM public.financial_classifications g
WHERE g.code = 'PRJ' AND g.level = 'group'
  AND g.entity_id = '00000000-0000-4000-a000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_classifications
    WHERE code = 'PRJ.EXP' AND entity_id = g.entity_id
  );

ALTER TYPE public.fdrq_source ADD VALUE IF NOT EXISTS 'project_expense';

ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS source_project_expense_id uuid
    REFERENCES public.pm_expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fdrq_source_project_expense_idx
  ON public.financial_document_review_queue(source_project_expense_id);

CREATE OR REPLACE FUNCTION public.pm_expense_link_reimbursement(p_expense_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp       public.pm_expenses;
  v_existing  uuid;
  v_in_queue  boolean;
  v_supplier  uuid;
  v_collab_nm text;
  v_proj_nm   text;
  v_due       date;
  v_period    uuid;
  v_new_id    uuid;
  v_date      date;
BEGIN
  SELECT * INTO v_exp FROM public.pm_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_exp.reimbursable IS NOT TRUE
     OR v_exp.payment_source_type <> 'personal'
     OR v_exp.status NOT IN ('approved', 'paid') THEN
    RETURN NULL;
  END IF;

  -- Receipt is in the Finance review queue: accounting records it there.
  SELECT EXISTS (
    SELECT 1 FROM public.financial_document_review_queue q
    WHERE q.source_project_expense_id = p_expense_id
      AND q.status <> 'rejected'
  ) INTO v_in_queue;
  IF v_in_queue THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing
    FROM public.financial_expense_items
   WHERE source_ref_table = 'pm_expenses'
     AND source_ref_id    = p_expense_id
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_supplier := public.get_reimbursement_supplier_id();

  SELECT nome INTO v_collab_nm
    FROM public.collaborators WHERE id = v_exp.reimburse_collaborator_id;
  SELECT name INTO v_proj_nm
    FROM public.pm_projects WHERE id = v_exp.project_id;

  v_date := COALESCE(v_exp.incurred_at, v_exp.expense_date, CURRENT_DATE);
  v_due := (date_trunc('month', v_date) + INTERVAL '1 month - 1 day')::date;

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
    format('Reembolso despesa de projeto — %s — %s',
           COALESCE(v_collab_nm, '?'), COALESCE(v_proj_nm, '?')),
    'operational', 'confirmed',
    COALESCE(v_exp.amount_ex_vat, v_exp.purchase_price), COALESCE(v_exp.vat_rate, 0),
    v_exp.purchase_price,
    'pm_expenses', p_expense_id, auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fdrq_guard_origin_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group_code text;
BEGIN
  IF NEW.suggested_classification_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.source_benefit_expense_id IS NULL AND NEW.source_project_expense_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT g.code INTO v_group_code
  FROM public.financial_classifications c
  JOIN public.financial_classifications g ON g.id = c.parent_id
  WHERE c.id = NEW.suggested_classification_id;

  IF NEW.source_benefit_expense_id IS NOT NULL AND v_group_code IS DISTINCT FROM 'PES' THEN
    RAISE EXCEPTION 'HR-origin items may only be classified under PES' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_project_expense_id IS NOT NULL AND v_group_code IS DISTINCT FROM 'PRJ' THEN
    RAISE EXCEPTION 'Project-origin items may only be classified under PRJ' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fdrq_guard_origin_classification_trg ON public.financial_document_review_queue;
CREATE TRIGGER fdrq_guard_origin_classification_trg
BEFORE INSERT OR UPDATE OF suggested_classification_id
ON public.financial_document_review_queue
FOR EACH ROW EXECUTE FUNCTION public.fdrq_guard_origin_classification();
