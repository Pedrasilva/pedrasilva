ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS drive_copy_status text,
  ADD COLUMN IF NOT EXISTS drive_web_link text,
  ADD COLUMN IF NOT EXISTS drive_copied_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_copy_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_copy_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drive_next_retry_at timestamptz;
ALTER TABLE public.financial_document_review_queue
  ADD CONSTRAINT fdrq_drive_copy_status_check CHECK (drive_copy_status IS NULL OR drive_copy_status IN ('pending','copied','failed'));
UPDATE public.financial_document_review_queue
  SET drive_copy_status = CASE WHEN drive_file_id IS NOT NULL THEN 'copied' ELSE 'pending' END,
      drive_next_retry_at = CASE WHEN drive_file_id IS NULL THEN now() END
  WHERE status = 'filed' AND intake_route = 'bank' AND drive_copy_status IS NULL;
CREATE INDEX IF NOT EXISTS fdrq_drive_copy_idx ON public.financial_document_review_queue (drive_copy_status, drive_next_retry_at) WHERE drive_copy_status IN ('pending','failed');