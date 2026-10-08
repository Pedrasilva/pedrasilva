CREATE TABLE public.finance_entity_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, user_id)
);
GRANT SELECT ON public.finance_entity_members TO authenticated;
GRANT ALL ON public.finance_entity_members TO service_role;
ALTER TABLE public.finance_entity_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY fem_read_own ON public.finance_entity_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY fem_admin_manage ON public.finance_entity_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.finance_entity_preferences (
  user_id uuid PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entity_preferences TO authenticated;
GRANT ALL ON public.finance_entity_preferences TO service_role;
ALTER TABLE public.finance_entity_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY fep_own ON public.finance_entity_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_entity_access(_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _entity_id IS NOT NULL AND (
    public.has_role(auth.uid(),'admin')
    OR auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM public.finance_entity_members m WHERE m.entity_id = _entity_id AND m.user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.is_finance_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_permission(_uid,'finance.dashboard')
$$;

-- parent-entity helpers for child tables
CREATE OR REPLACE FUNCTION public.fin_entity_of(_table text, _id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e uuid;
BEGIN
  IF _id IS NULL THEN RETURN NULL; END IF;
  IF _table NOT IN ('financial_documents','bank_transactions','financial_expense_items','financial_debts','benefit_expenses') THEN
    RAISE EXCEPTION 'fin_entity_of: unsupported table %', _table;
  END IF;
  EXECUTE format('SELECT entity_id FROM public.%I WHERE id = $1', _table) INTO e USING _id;
  RETURN e;
END $$;

-- Seed PSA members: everyone with finance access today
INSERT INTO public.finance_entity_members (entity_id, user_id)
SELECT '00000000-0000-4000-a000-000000000001', u.id FROM auth.users u
WHERE public.has_role(u.id,'admin') OR public.has_permission(u.id,'finance.dashboard')
   OR EXISTS (SELECT 1 FROM public.user_role_assignments a WHERE a.user_id=u.id AND a.role::text='admin')
   OR EXISTS (SELECT 1 FROM public.user_permissions p WHERE p.user_id=u.id AND p.permission_key='finance.dashboard')
   OR EXISTS (SELECT 1 FROM public.list_user_effective_permissions(u.id) x WHERE x.permission_key='finance.dashboard')
ON CONFLICT DO NOTHING;

-- RLS: append entity check to every policy
DO $$
DECLARE r record; strict_t text[] := ARRAY[
  'bank_accounts','bank_transactions','bank_statement_imports','bank_statement_periods','bank_balance_snapshots','bank_classification_rules',
  'financial_classifications','cost_categories','expense_categories','pm_invoice_settings',
  'financial_documents','financial_document_review_queue','financial_periods','financial_debts','financial_expense_items','financial_income_items',
  'finance_recebimentos','company_expenses',
  'finance_intake_instructions','finance_sender_rules','finance_intake_settings','finance_intake_corrections','finance_duplicate_decisions',
  'financial_email_processed_messages','financial_email_ignored_items','financial_drive_processed_files','financial_import_logs','tax_withholdings'];
  shared_t text[] := ARRAY['benefit_expenses','pm_invoices','pm_payment_schedule_items','pm_suppliers'];
  child jsonb := '{"financial_document_lines":["financial_documents","document_id"],"financial_document_payments":["financial_documents","document_id"],"bank_transaction_classifications":["bank_transactions","bank_transaction_id"],"financial_expense_payments":["financial_expense_items","expense_item_id"],"financial_debt_payments":["financial_debts","debt_id"],"benefit_expense_ocr_extractions":["benefit_expenses","expense_id"],"benefit_expense_events":["benefit_expenses","expense_id"]}';
  cond text; sql text;
BEGIN
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='public'
    AND (tablename = ANY(strict_t) OR tablename = ANY(shared_t) OR child ? tablename) LOOP
    IF r.tablename = ANY(strict_t) THEN
      cond := 'public.has_entity_access(entity_id)';
    ELSIF r.tablename = ANY(shared_t) THEN
      cond := '(public.has_entity_access(entity_id) OR NOT public.is_finance_user(auth.uid()))';
    ELSIF r.tablename IN ('benefit_expense_ocr_extractions','benefit_expense_events') THEN
      cond := format('(public.has_entity_access(public.fin_entity_of(%L,%I)) OR NOT public.is_finance_user(auth.uid()))', child->r.tablename->>0, child->r.tablename->>1);
    ELSE
      cond := format('public.has_entity_access(public.fin_entity_of(%L,%I))', child->r.tablename->>0, child->r.tablename->>1);
    END IF;
    sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN sql := sql || format(' USING ((%s) AND %s)', r.qual, cond); END IF;
    IF r.with_check IS NOT NULL THEN sql := sql || format(' WITH CHECK ((%s) AND %s)', r.with_check, cond);
    ELSIF r.cmd = 'INSERT' THEN sql := sql || format(' WITH CHECK (%s)', cond); END IF;
    EXECUTE sql;
  END LOOP;
END $$;

-- Uniqueness per entity
ALTER TABLE public.financial_classifications DROP CONSTRAINT financial_classifications_code_key;
ALTER TABLE public.financial_classifications ADD CONSTRAINT financial_classifications_entity_code_key UNIQUE (entity_id, code);
ALTER TABLE public.financial_periods DROP CONSTRAINT financial_periods_year_month_key;
ALTER TABLE public.financial_periods ADD CONSTRAINT financial_periods_entity_year_month_key UNIQUE (entity_id, year, month);
ALTER TABLE public.cost_categories ADD CONSTRAINT cost_categories_entity_slug_key UNIQUE (entity_id, slug);
ALTER TABLE public.pm_invoice_settings DROP CONSTRAINT pm_invoice_settings_singleton_key;
CREATE UNIQUE INDEX pm_invoice_settings_entity_global_uniq ON public.pm_invoice_settings (entity_id) WHERE project_id IS NULL;
ALTER TABLE public.finance_intake_settings ADD CONSTRAINT finance_intake_settings_entity_key UNIQUE (entity_id);
ALTER TABLE public.pm_invoices DROP CONSTRAINT pm_invoices_invoice_number_key;
ALTER TABLE public.pm_invoices ADD CONSTRAINT pm_invoices_entity_invoice_number_key UNIQUE (entity_id, invoice_number);
DROP INDEX public.uniq_financial_import_logs_type_checksum;
CREATE UNIQUE INDEX uniq_financial_import_logs_entity_type_checksum ON public.financial_import_logs (entity_id, import_type, file_checksum) WHERE file_checksum IS NOT NULL;
CREATE OR REPLACE FUNCTION public.current_finance_entity()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.entity_id FROM public.finance_entity_preferences p
      WHERE p.user_id = auth.uid() AND public.has_entity_access(p.entity_id)),
    (SELECT e.id FROM public.finance_entities e
      WHERE e.active AND public.has_entity_access(e.id)
      ORDER BY (e.id = '00000000-0000-4000-a000-000000000001') DESC, e.created_at LIMIT 1)
  )
$$;

-- A row is visible only for an entity the user can access AND that is their current entity:
-- no query can ever mix two entities.
CREATE OR REPLACE FUNCTION public.fin_row_visible(_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_entity_access(_entity_id) AND _entity_id = public.current_finance_entity()
$$;

DO $$
DECLARE r record; sql text;
BEGIN
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='public'
    AND (coalesce(qual,'') LIKE '%has_entity_access(%' OR coalesce(with_check,'') LIKE '%has_entity_access(%') LOOP
    sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN sql := sql || format(' USING (%s)', replace(r.qual,'has_entity_access(','fin_row_visible(')); END IF;
    IF r.with_check IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', replace(r.with_check,'has_entity_access(','fin_row_visible(')); END IF;
    EXECUTE sql;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_finance_entity(_entity_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_entity_access(_entity_id) THEN RAISE EXCEPTION 'No access to this entity'; END IF;
  INSERT INTO public.finance_entity_preferences (user_id, entity_id) VALUES (auth.uid(), _entity_id)
  ON CONFLICT (user_id) DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = now();
  RETURN _entity_id;
END $$;
GRANT EXECUTE ON FUNCTION public.set_finance_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_finance_entity() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_finance_entities()
RETURNS TABLE(id uuid, name text, nif text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.name, e.nif FROM public.finance_entities e
  WHERE e.active AND public.has_entity_access(e.id) ORDER BY e.created_at
$$;
GRANT EXECUTE ON FUNCTION public.my_finance_entities() TO authenticated;

INSERT INTO public.finance_entities (name, nif) VALUES ('Pedra Rioja', '513789898') ON CONFLICT (nif) DO NOTHING;CREATE OR REPLACE FUNCTION public.fin_require_entity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE shared boolean := TG_TABLE_NAME IN ('benefit_expenses','pm_invoices','pm_payment_schedule_items','pm_suppliers');
BEGIN
  IF NEW.entity_id IS NOT NULL THEN RETURN NEW; END IF;
  -- Finance rows derived from a benefit expense belong to that expense's entity.
  IF TG_TABLE_NAME = 'financial_expense_items' AND NEW.source_ref_table = 'benefit_expenses' THEN
    NEW.entity_id := public.fin_entity_of('benefit_expenses', NEW.source_ref_id);
  END IF;
  -- A signed-in user's write goes to the entity they are working in (switcher).
  IF NEW.entity_id IS NULL AND auth.uid() IS NOT NULL AND NOT shared THEN
    NEW.entity_id := public.current_finance_entity();
  END IF;
  -- Project/HR rows (invoices, schedules, suppliers, benefit claims) are PSA's until
  -- projects become multi-entity.
  IF NEW.entity_id IS NULL AND shared THEN
    NEW.entity_id := '00000000-0000-4000-a000-000000000001';
  END IF;
  IF NEW.entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id is required on %', TG_TABLE_NAME USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_accounts','bank_transactions','bank_statement_imports','bank_statement_periods','bank_balance_snapshots','bank_classification_rules',
    'financial_classifications','cost_categories','expense_categories','pm_suppliers','pm_invoices','pm_invoice_settings',
    'financial_documents','financial_document_review_queue','financial_periods','financial_debts','financial_expense_items','financial_income_items',
    'finance_recebimentos','company_expenses','benefit_expenses','pm_payment_schedule_items',
    'finance_intake_instructions','finance_sender_rules','finance_intake_settings','finance_intake_corrections','finance_duplicate_decisions',
    'financial_email_processed_messages','financial_email_ignored_items','financial_drive_processed_files','financial_import_logs','tax_withholdings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN entity_id DROP DEFAULT', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fin_require_entity()', t || '_require_entity', t);
  END LOOP;
END $$;

-- tax_withholdings follow their document
CREATE OR REPLACE FUNCTION public.fin_withholding_entity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.entity_id IS NULL AND NEW.document_id IS NOT NULL THEN
    NEW.entity_id := public.fin_entity_of('financial_documents', NEW.document_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tax_withholdings_aa_entity BEFORE INSERT ON public.tax_withholdings FOR EACH ROW EXECUTE FUNCTION public.fin_withholding_entity();CREATE OR REPLACE FUNCTION public.fin_withholding_entity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.entity_id IS NULL AND NEW.financial_document_id IS NOT NULL THEN
    NEW.entity_id := public.fin_entity_of('financial_documents', NEW.financial_document_id);
  END IF;
  RETURN NEW;
END $$;