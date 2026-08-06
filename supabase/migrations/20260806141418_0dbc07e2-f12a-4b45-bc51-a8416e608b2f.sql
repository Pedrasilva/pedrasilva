ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS paid_from_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS paid_from_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fin_docs_paid_from_account ON public.financial_documents(paid_from_account_id);