-- Unify suppliers into companies (single counterparty master).
-- All current supplier FKs are 0-rows so no data backfill is needed.

-- 1. Add optional default classification on companies (used as supplier hint).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_classification_id uuid
    REFERENCES public.expense_categories(id) ON DELETE SET NULL;

-- 2. Repoint supplier FKs to companies.
ALTER TABLE public.financial_documents
  DROP CONSTRAINT IF EXISTS financial_documents_counterparty_supplier_id_fkey,
  ADD CONSTRAINT financial_documents_counterparty_supplier_id_fkey
    FOREIGN KEY (counterparty_supplier_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.bank_transaction_classifications
  DROP CONSTRAINT IF EXISTS bank_transaction_classifications_supplier_id_fkey,
  ADD CONSTRAINT bank_transaction_classifications_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.financial_expense_items
  DROP CONSTRAINT IF EXISTS financial_expense_items_supplier_id_fkey,
  ADD CONSTRAINT financial_expense_items_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- 3. Drop financial_suppliers — fully unused now.
DROP TABLE IF EXISTS public.financial_suppliers;

-- 4. Update finance_reset_test_data to no longer reference financial_suppliers.
--    Companies (master data) are NOT wiped by reset.
CREATE OR REPLACE FUNCTION public.finance_reset_test_data(_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _confirm IS DISTINCT FROM 'DELETE TEST FINANCE DATA' THEN
    RAISE EXCEPTION 'confirmation_required' USING DETAIL = 'Pass the exact string DELETE TEST FINANCE DATA to confirm.';
  END IF;

  SELECT jsonb_build_object(
    'bank_transactions', (SELECT count(*) FROM public.bank_transactions),
    'bank_statement_imports', (SELECT count(*) FROM public.bank_statement_imports),
    'bank_transaction_classifications', (SELECT count(*) FROM public.bank_transaction_classifications),
    'bank_balance_snapshots', (SELECT count(*) FROM public.bank_balance_snapshots),
    'financial_documents', (SELECT count(*) FROM public.financial_documents),
    'financial_document_lines', (SELECT count(*) FROM public.financial_document_lines),
    'financial_document_payments', (SELECT count(*) FROM public.financial_document_payments),
    'financial_expense_items', (SELECT count(*) FROM public.financial_expense_items),
    'financial_income_items', (SELECT count(*) FROM public.financial_income_items),
    'financial_import_logs', (SELECT count(*) FROM public.financial_import_logs)
  ) INTO v_counts;

  DELETE FROM public.financial_document_payments;
  DELETE FROM public.financial_document_lines;
  DELETE FROM public.financial_documents;
  DELETE FROM public.bank_transaction_classifications;
  DELETE FROM public.bank_transactions;
  DELETE FROM public.bank_statement_imports;
  DELETE FROM public.bank_balance_snapshots;
  DELETE FROM public.financial_expense_items;
  DELETE FROM public.financial_income_items;
  DELETE FROM public.financial_import_logs;

  RETURN jsonb_build_object('status', 'ok', 'deleted', v_counts);
END;
$function$;

-- 5. Helper RPC: delete supplier-only companies that have no transactional links.
--    Useful after testing — wipes only companies flagged is_supplier=true that
--    are NOT also clients and NOT referenced anywhere.
CREATE OR REPLACE FUNCTION public.finance_delete_unused_supplier_companies(_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_deleted int;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _confirm IS DISTINCT FROM 'DELETE UNUSED SUPPLIER COMPANIES' THEN
    RAISE EXCEPTION 'confirmation_required' USING DETAIL = 'Pass the exact string DELETE UNUSED SUPPLIER COMPANIES to confirm.';
  END IF;

  WITH del AS (
    DELETE FROM public.companies c
    WHERE c.is_supplier = true
      AND c.is_client = false
      AND NOT EXISTS (SELECT 1 FROM public.financial_documents d WHERE d.counterparty_supplier_id = c.id OR d.counterparty_client_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.bank_transaction_classifications b WHERE b.supplier_id = c.id OR b.client_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.financial_expense_items e WHERE e.supplier_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.financial_income_items i WHERE i.client_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crm_opportunities o WHERE o.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crm_accounts a WHERE a.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.pm_projects pp WHERE pp.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.fee_proposals fp WHERE fp.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.contacts ct WHERE ct.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crm_activities ca WHERE ca.company_id = c.id)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN jsonb_build_object('status', 'ok', 'deleted', v_deleted);
END;
$function$;