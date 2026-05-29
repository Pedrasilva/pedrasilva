
-- 1. salary_snapshots: separate "effective from for project cost rate"
ALTER TABLE public.salary_snapshots
  ADD COLUMN IF NOT EXISTS project_cost_effective_from DATE NULL;

COMMENT ON COLUMN public.salary_snapshots.project_cost_effective_from IS
  'Date from which this snapshot should affect project cost rates. When NULL, propagation defaults to effective_from. Allows a salary to be retroactive for payroll/HR while only impacting project margins from a chosen later date.';

-- 2. pm_resource_rates: track origin of each rate row for idempotent propagation
ALTER TABLE public.pm_resource_rates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_snapshot_id UUID NULL REFERENCES public.salary_snapshots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pm_resource_rates_source_snapshot
  ON public.pm_resource_rates(source_snapshot_id)
  WHERE source_snapshot_id IS NOT NULL;
