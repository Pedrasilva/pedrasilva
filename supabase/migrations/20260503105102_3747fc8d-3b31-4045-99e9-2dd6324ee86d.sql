-- Add source/lock metadata to pm_stages for imported (historical) stages
ALTER TABLE public.pm_stages
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- Add source/lock/external_id metadata + imported totals to pm_allocations
ALTER TABLE public.pm_allocations
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS total_hours_imported numeric(12,2);

CREATE UNIQUE INDEX IF NOT EXISTS pm_allocations_external_id_key
  ON public.pm_allocations (external_id) WHERE external_id IS NOT NULL;

-- Link historical time entries to a reconstructed stage (nullable, set null on stage delete)
ALTER TABLE public.historical_time_entries
  ADD COLUMN IF NOT EXISTS stage_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historical_time_entries_stage_id_fkey'
  ) THEN
    ALTER TABLE public.historical_time_entries
      ADD CONSTRAINT historical_time_entries_stage_id_fkey
      FOREIGN KEY (stage_id) REFERENCES public.pm_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hist_time_stage ON public.historical_time_entries (stage_id);