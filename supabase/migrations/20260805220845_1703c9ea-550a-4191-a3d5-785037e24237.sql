ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS buyer_vat_is_own boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extracted_payment_method text,
  ADD COLUMN IF NOT EXISTS extracted_card_last4 text,
  ADD COLUMN IF NOT EXISTS extracted_balance_due numeric,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'awaiting_payment';

ALTER TABLE public.financial_document_review_queue
  DROP CONSTRAINT IF EXISTS fdrq_payment_status_chk;
ALTER TABLE public.financial_document_review_queue
  ADD CONSTRAINT fdrq_payment_status_chk
  CHECK (payment_status IN ('paid_at_source','awaiting_payment','reconciled'));

ALTER TABLE public.financial_document_review_queue
  DROP CONSTRAINT IF EXISTS fdrq_payment_method_chk;
ALTER TABLE public.financial_document_review_queue
  ADD CONSTRAINT fdrq_payment_method_chk
  CHECK (extracted_payment_method IS NULL OR extracted_payment_method IN ('card','cash','bank_transfer','direct_debit','not_stated'));

ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS billed_to_own_vat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method_extracted text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'awaiting_payment';

ALTER TABLE public.financial_documents
  DROP CONSTRAINT IF EXISTS fin_docs_payment_status_chk;
ALTER TABLE public.financial_documents
  ADD CONSTRAINT fin_docs_payment_status_chk
  CHECK (payment_status IN ('paid_at_source','awaiting_payment','reconciled'));

ALTER TABLE public.financial_documents
  DROP CONSTRAINT IF EXISTS fin_docs_payment_method_extracted_chk;
ALTER TABLE public.financial_documents
  ADD CONSTRAINT fin_docs_payment_method_extracted_chk
  CHECK (payment_method_extracted IS NULL OR payment_method_extracted IN ('card','cash','bank_transfer','direct_debit','not_stated'));

UPDATE public.financial_documents
   SET payment_status = 'reconciled'
 WHERE COALESCE(outstanding_amount, 0) <= 0
   AND payment_status = 'awaiting_payment';

CREATE INDEX IF NOT EXISTS fin_docs_payment_status_idx
  ON public.financial_documents (payment_status);