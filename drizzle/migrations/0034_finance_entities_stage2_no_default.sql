CREATE OR REPLACE FUNCTION public.fin_require_entity()
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
CREATE TRIGGER tax_withholdings_aa_entity BEFORE INSERT ON public.tax_withholdings FOR EACH ROW EXECUTE FUNCTION public.fin_withholding_entity();