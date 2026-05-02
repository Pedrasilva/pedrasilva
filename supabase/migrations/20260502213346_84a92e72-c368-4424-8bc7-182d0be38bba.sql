
-- ============================================================
-- IMPORT ENGINE FOUNDATION
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.import_type AS ENUM (
    'accelo_activity_timesheet',
    'companies_clients_suppliers'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_job_status AS ENUM (
    'uploaded', 'previewed', 'validated', 'imported', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_row_status AS ENUM (
    'pending', 'valid', 'warning', 'error', 'imported', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- import_jobs
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type public.import_type NOT NULL,
  source_system text NOT NULL DEFAULT 'unknown',
  original_filename text,
  storage_path text,
  status public.import_job_status NOT NULL DEFAULT 'uploaded',
  row_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_type ON public.import_jobs(import_type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON public.import_jobs(created_at DESC);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage import jobs" ON public.import_jobs;
CREATE POLICY "Admins manage import jobs" ON public.import_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- import_job_rows
CREATE TABLE IF NOT EXISTS public.import_job_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  parsed_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.import_row_status NOT NULL DEFAULT 'pending',
  external_id text,
  error_message text,
  warning_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_job_rows_job ON public.import_job_rows(import_job_id, row_number);
CREATE INDEX IF NOT EXISTS idx_import_job_rows_status ON public.import_job_rows(import_job_id, status);

ALTER TABLE public.import_job_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage import job rows" ON public.import_job_rows;
CREATE POLICY "Admins manage import job rows" ON public.import_job_rows
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- HISTORICAL TIME ENTRIES (Accelo legacy data)
-- Kept separate from pm_time_entries which requires task_id + auth user_id
-- ============================================================
CREATE TABLE IF NOT EXISTS public.historical_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  external_id text NOT NULL,
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL,
  entry_date date NOT NULL,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  resource_id uuid REFERENCES public.pm_resources(id) ON DELETE SET NULL,
  collaborator_email text,
  project_id uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  project_reference text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name text,
  subject text,
  content text,
  rate_title text,
  rate numeric(10,2),
  billable_hours numeric(8,2) NOT NULL DEFAULT 0,
  non_billable_hours numeric(8,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  profit numeric(12,2) NOT NULL DEFAULT 0,
  status_text text,
  invoice_number text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_time_entries_source_external_uk UNIQUE (source_system, external_id)
);

CREATE INDEX IF NOT EXISTS idx_hist_time_project ON public.historical_time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_hist_time_collab ON public.historical_time_entries(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_hist_time_company ON public.historical_time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_hist_time_date ON public.historical_time_entries(entry_date);

ALTER TABLE public.historical_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage historical time entries" ON public.historical_time_entries;
CREATE POLICY "Admins manage historical time entries" ON public.historical_time_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read historical time entries" ON public.historical_time_entries;
CREATE POLICY "Authenticated read historical time entries" ON public.historical_time_entries
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_hist_time_updated
  BEFORE UPDATE ON public.historical_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Storage bucket for raw import files
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('import-files', 'import-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage import files" ON storage.objects;
CREATE POLICY "Admins manage import files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'import-files' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'import-files' AND public.has_role(auth.uid(), 'admin'::app_role));
