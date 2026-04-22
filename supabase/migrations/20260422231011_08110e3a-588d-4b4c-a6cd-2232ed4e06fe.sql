-- Add external_id columns for traceability + idempotent re-imports
ALTER TABLE public.pm_projects     ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.pm_stages       ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.pm_tasks        ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.pm_time_entries ADD COLUMN IF NOT EXISTS external_id text;

-- Unique partial indexes: enforce uniqueness only when external_id is set,
-- so manual rows (NULL) never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS pm_projects_external_id_key
  ON public.pm_projects (external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pm_stages_external_id_key
  ON public.pm_stages (external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pm_tasks_external_id_key
  ON public.pm_tasks (external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pm_time_entries_external_id_key
  ON public.pm_time_entries (external_id) WHERE external_id IS NOT NULL;