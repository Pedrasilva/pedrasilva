ALTER TABLE public.pm_expenses
  ADD COLUMN IF NOT EXISTS receipt_path text,
  ADD COLUMN IF NOT EXISTS supplier_nif text,
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS amount_ex_vat numeric,
  ADD COLUMN IF NOT EXISTS vat_amount numeric,
  ADD COLUMN IF NOT EXISTS vat_rate numeric,
  ADD COLUMN IF NOT EXISTS payment_source_type text NOT NULL DEFAULT 'company_account',
  ADD COLUMN IF NOT EXISTS payment_source_label text,
  ADD COLUMN IF NOT EXISTS reimbursable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reimburse_collaborator_id uuid REFERENCES public.collaborators(id);

CREATE INDEX IF NOT EXISTS pm_expenses_reimburse_collab_idx
  ON public.pm_expenses (reimburse_collaborator_id);

CREATE OR REPLACE FUNCTION public.pm_expense_link_reimbursement(p_expense_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exp       public.pm_expenses;
  v_existing  uuid;
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

CREATE OR REPLACE FUNCTION public.pm_expenses_reimbursement_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.pm_expense_link_reimbursement(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pm_expenses_reimbursement ON public.pm_expenses;
CREATE TRIGGER pm_expenses_reimbursement
AFTER INSERT OR UPDATE OF status, reimbursable, payment_source_type, purchase_price
ON public.pm_expenses
FOR EACH ROW EXECUTE FUNCTION public.pm_expenses_reimbursement_trg();