ALTER TABLE public.financial_document_review_queue ADD COLUMN IF NOT EXISTS drive_intake_link text;
ALTER TABLE public.financial_drive_processed_files ADD COLUMN IF NOT EXISTS processed_name text, ADD COLUMN IF NOT EXISTS drive_link text, ADD COLUMN IF NOT EXISTS trashed_at timestamptz;

CREATE TABLE public.finance_accounting_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('document','statement','report_pdf','report_xlsx')),
  source_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  source_stamp text,
  subfolder text NOT NULL,
  period text NOT NULL,
  folder_path text NOT NULL,
  drive_folder_id text,
  drive_file_id text,
  drive_link text,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'exported' CHECK (status IN ('exported','removed','failed')),
  last_error text,
  exported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id, version)
);
GRANT SELECT ON public.finance_accounting_exports TO authenticated;
GRANT ALL ON public.finance_accounting_exports TO service_role;
REVOKE TRUNCATE ON public.finance_accounting_exports FROM anon, authenticated;
ALTER TABLE public.finance_accounting_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read accounting exports" ON public.finance_accounting_exports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX finance_accounting_exports_period_idx ON public.finance_accounting_exports (entity_id, period, subfolder);