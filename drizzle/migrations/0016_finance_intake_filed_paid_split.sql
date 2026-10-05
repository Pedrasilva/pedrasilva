ALTER TYPE public.fdrq_status ADD VALUE IF NOT EXISTS 'filed';
ALTER TYPE public.fdrq_status ADD VALUE IF NOT EXISTS 'paid';

ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS split_of_file_url text,
  ADD COLUMN IF NOT EXISTS split_part integer,
  ADD COLUMN IF NOT EXISTS split_page_first integer,
  ADD COLUMN IF NOT EXISTS split_page_last integer;

COMMENT ON COLUMN public.financial_document_review_queue.split_of_file_url IS
  'Original stored file when this item is one notice cut out of a multi-notice PDF (page range in split_page_first/last).';

CREATE INDEX IF NOT EXISTS fdrq_split_of_idx ON public.financial_document_review_queue (split_of_file_url) WHERE split_of_file_url IS NOT NULL;

ALTER TABLE public.financial_document_review_queue DROP CONSTRAINT IF EXISTS fdrq_verification_chk;
ALTER TABLE public.financial_document_review_queue
  ADD CONSTRAINT fdrq_verification_chk CHECK (verification IS NULL OR verification IN ('full','partial','none','single'));