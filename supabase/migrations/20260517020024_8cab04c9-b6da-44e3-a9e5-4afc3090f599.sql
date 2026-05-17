
-- Phase A: OCR + payment-source foundation for HR Benefit expenses

-- 1. OCR extractions table
CREATE TABLE public.benefit_expense_ocr_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','superseded')),
  provider text,
  raw_response jsonb,
  extracted jsonb,
  confidence jsonb,
  matched_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  expense_id uuid, -- FK added after benefit_expenses column exists
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_benefit_ocr_extractions_collab ON public.benefit_expense_ocr_extractions(collaborator_id);
CREATE INDEX idx_benefit_ocr_extractions_expense ON public.benefit_expense_ocr_extractions(expense_id);
CREATE INDEX idx_benefit_ocr_extractions_status ON public.benefit_expense_ocr_extractions(status);

ALTER TABLE public.benefit_expense_ocr_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own OCR; approvers/admins read all"
  ON public.benefit_expense_ocr_extractions FOR SELECT TO authenticated
  USING (can_approve_benefits(auth.uid()) OR collaborator_id = get_my_collaborator_id());

CREATE POLICY "Users insert own OCR rows"
  ON public.benefit_expense_ocr_extractions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR collaborator_id = get_my_collaborator_id());

CREATE POLICY "Users update own pending OCR; admins update any"
  ON public.benefit_expense_ocr_extractions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR collaborator_id = get_my_collaborator_id())
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR collaborator_id = get_my_collaborator_id());

CREATE POLICY "Admins delete OCR rows"
  ON public.benefit_expense_ocr_extractions FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- 2. Nullable OCR/accounting/payment fields on benefit_expenses
ALTER TABLE public.benefit_expenses
  ADD COLUMN supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN supplier_nif text,
  ADD COLUMN supplier_name_snapshot text,
  ADD COLUMN document_number text,
  ADD COLUMN vat_amount numeric(14,2),
  ADD COLUMN vat_rate numeric(5,2),
  ADD COLUMN amount_ex_vat numeric(14,2),
  ADD COLUMN ocr_extraction_id uuid REFERENCES public.benefit_expense_ocr_extractions(id) ON DELETE SET NULL,
  ADD COLUMN payment_source_type text CHECK (payment_source_type IN ('personal','company_card','company_account','cash','unknown')),
  ADD COLUMN payment_source_label text,
  ADD COLUMN payment_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_benefit_expenses_supplier_company ON public.benefit_expenses(supplier_company_id);
CREATE INDEX idx_benefit_expenses_ocr_extraction ON public.benefit_expenses(ocr_extraction_id);
CREATE INDEX idx_benefit_expenses_payment_account ON public.benefit_expenses(payment_account_id);

-- 3. Now add cross FK from OCR table to expense
ALTER TABLE public.benefit_expense_ocr_extractions
  ADD CONSTRAINT benefit_expense_ocr_extractions_expense_id_fkey
  FOREIGN KEY (expense_id) REFERENCES public.benefit_expenses(id) ON DELETE SET NULL;

-- 4. Partial unique index on companies.nif (no duplicates exist)
CREATE UNIQUE INDEX uniq_companies_nif_not_null
  ON public.companies(nif) WHERE nif IS NOT NULL;
