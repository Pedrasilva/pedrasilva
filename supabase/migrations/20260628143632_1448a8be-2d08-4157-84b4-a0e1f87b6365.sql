-- Backup runs audit log
CREATE TYPE public.backup_trigger AS ENUM ('daily', 'weekly', 'manual');
CREATE TYPE public.backup_status AS ENUM ('running', 'success', 'failed');

CREATE TABLE public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger public.backup_trigger NOT NULL,
  status public.backup_status NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  drive_file_id text,
  drive_file_name text,
  drive_folder_id text,
  drive_url text,
  size_bytes bigint,
  tables_count integer,
  rows_count integer,
  error text,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view backup runs"
  ON public.backup_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX backup_runs_started_at_idx ON public.backup_runs (started_at DESC);
CREATE INDEX backup_runs_status_idx ON public.backup_runs (status);
