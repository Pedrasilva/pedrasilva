-- 1. Allocation status enum
DO $$ BEGIN
  CREATE TYPE public.pm_allocation_status AS ENUM ('tentative', 'committed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. pm_stages baseline columns
ALTER TABLE public.pm_stages
  ADD COLUMN IF NOT EXISTS baseline_start_date date,
  ADD COLUMN IF NOT EXISTS baseline_end_date date,
  ADD COLUMN IF NOT EXISTS baseline_budget numeric,
  ADD COLUMN IF NOT EXISTS baseline_target_hours numeric,
  ADD COLUMN IF NOT EXISTS baseline_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS baseline_notes text;

-- 3. pm_allocations status columns
ALTER TABLE public.pm_allocations
  ADD COLUMN IF NOT EXISTS status public.pm_allocation_status NOT NULL DEFAULT 'committed',
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- 4. Trigger to stamp status_changed_at when status changes
CREATE OR REPLACE FUNCTION public.pm_stamp_allocation_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_at := now();
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pm_allocations_stamp_status ON public.pm_allocations;
CREATE TRIGGER pm_allocations_stamp_status
  BEFORE INSERT OR UPDATE OF status ON public.pm_allocations
  FOR EACH ROW EXECUTE FUNCTION public.pm_stamp_allocation_status_change();

-- 5. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_pm_allocations_status ON public.pm_allocations(status);
CREATE INDEX IF NOT EXISTS idx_pm_stages_baseline_locked ON public.pm_stages(baseline_locked_at) WHERE baseline_locked_at IS NOT NULL;