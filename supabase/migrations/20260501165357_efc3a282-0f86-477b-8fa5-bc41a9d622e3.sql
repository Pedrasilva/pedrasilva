-- =====================================================================
-- Part 1: Companies as single source of truth for clients
-- =====================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_supplier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_companies_is_client ON public.companies(is_client) WHERE is_client = true;
CREATE INDEX IF NOT EXISTS idx_companies_is_supplier ON public.companies(is_supplier) WHERE is_supplier = true;

-- =====================================================================
-- Part 2: Wipe transactional finance data BEFORE repointing FKs
-- (test data only — financial_documents/lines/payments/company_expenses are empty;
--  bank_* and financial_expense/income_items hold imported test rows.)
-- =====================================================================

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
DELETE FROM public.financial_suppliers;
DELETE FROM public.financial_clients;

-- =====================================================================
-- Part 3: Repoint client FKs from financial_clients → companies
-- =====================================================================

ALTER TABLE public.financial_documents
  DROP CONSTRAINT IF EXISTS financial_documents_counterparty_client_id_fkey;
ALTER TABLE public.financial_documents
  ADD CONSTRAINT financial_documents_counterparty_client_id_fkey
  FOREIGN KEY (counterparty_client_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.bank_transaction_classifications
  DROP CONSTRAINT IF EXISTS bank_transaction_classifications_client_id_fkey;
ALTER TABLE public.bank_transaction_classifications
  ADD CONSTRAINT bank_transaction_classifications_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.financial_income_items
  DROP CONSTRAINT IF EXISTS financial_income_items_client_id_fkey;
ALTER TABLE public.financial_income_items
  ADD CONSTRAINT financial_income_items_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- =====================================================================
-- Part 4: Drop financial_clients (unified into companies)
-- =====================================================================

DROP TABLE public.financial_clients;

-- =====================================================================
-- Part 5: Enrich supplier master fields
-- =====================================================================

ALTER TABLE public.financial_suppliers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;

-- =====================================================================
-- Part 6: Admin reset RPC
-- =====================================================================

CREATE OR REPLACE FUNCTION public.finance_reset_test_data(_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Capture counts before delete
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
    'financial_import_logs', (SELECT count(*) FROM public.financial_import_logs),
    'financial_suppliers', (SELECT count(*) FROM public.financial_suppliers)
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
  DELETE FROM public.financial_suppliers;

  RETURN jsonb_build_object('status', 'ok', 'deleted', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_reset_test_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_reset_test_data(text) TO authenticated;