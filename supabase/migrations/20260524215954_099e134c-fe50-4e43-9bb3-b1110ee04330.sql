
ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS invoicexpress_id bigint,
  ADD COLUMN IF NOT EXISTS invoicexpress_type text,
  ADD COLUMN IF NOT EXISTS invoicexpress_status text,
  ADD COLUMN IF NOT EXISTS atcud text,
  ADD COLUMN IF NOT EXISTS series text,
  ADD COLUMN IF NOT EXISTS permalink_pdf text,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_findoc_invoicexpress_id
  ON public.financial_documents(invoicexpress_id)
  WHERE invoicexpress_id IS NOT NULL;
