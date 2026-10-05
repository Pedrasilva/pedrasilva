ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_duplicate_of uuid REFERENCES public.financial_documents(id),
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;
COMMENT ON COLUMN public.financial_documents.voided_duplicate_of IS 'Set when this purchase was voided (status cancelled) as a duplicate of another document; never hard-deleted.';