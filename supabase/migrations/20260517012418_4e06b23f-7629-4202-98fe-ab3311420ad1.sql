
CREATE TYPE public.benefit_drive_sync_status AS ENUM ('pending','synced','failed','skipped_rejected');

CREATE TABLE public.benefit_expense_drive_sync (
  expense_id uuid PRIMARY KEY REFERENCES public.benefit_expenses(id) ON DELETE CASCADE,
  drive_file_id text,
  drive_folder_id text,
  drive_file_name text,
  source_checksum text,
  status public.benefit_drive_sync_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bed_sync_status ON public.benefit_expense_drive_sync(status);
CREATE UNIQUE INDEX uq_bed_sync_drive_file ON public.benefit_expense_drive_sync(drive_file_id) WHERE drive_file_id IS NOT NULL;

CREATE TABLE public.benefit_drive_folders (
  folder_path text PRIMARY KEY,
  drive_folder_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benefit_expense_drive_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_drive_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage drive sync"
  ON public.benefit_expense_drive_sync
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage drive folders"
  ON public.benefit_drive_folders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_bed_sync_updated
  BEFORE UPDATE ON public.benefit_expense_drive_sync
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
