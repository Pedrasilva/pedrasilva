ALTER TYPE public.fdrq_source ADD VALUE IF NOT EXISTS 'drive_folder';

CREATE TABLE IF NOT EXISTS public.financial_drive_processed_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL UNIQUE,
  file_name text,
  mime_type text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'queued',
  reason text,
  queue_item_id uuid REFERENCES public.financial_document_review_queue(id) ON DELETE SET NULL,
  storage_path text,
  moved_to text,
  error text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_drive_processed_files TO authenticated;
GRANT ALL ON public.financial_drive_processed_files TO service_role;
ALTER TABLE public.financial_drive_processed_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view drive intake log"
ON public.financial_drive_processed_files FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));