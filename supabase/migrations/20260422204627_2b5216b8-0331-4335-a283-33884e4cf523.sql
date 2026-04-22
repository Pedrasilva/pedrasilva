-- Add per-collaborator working schedule fields used by the project planner,
-- forecasting and capacity calculations. Defaults reflect the standard
-- full-time Portuguese contract (8h/day × 5 days/week = 40h/week).
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS daily_hours numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS days_per_week numeric NOT NULL DEFAULT 5;

ALTER TABLE public.collaborators
  ADD CONSTRAINT collaborators_daily_hours_chk CHECK (daily_hours > 0 AND daily_hours <= 24),
  ADD CONSTRAINT collaborators_days_per_week_chk CHECK (days_per_week > 0 AND days_per_week <= 7);

-- Keep pm_resources.weekly_capacity in sync when the underlying collaborator
-- schedule changes, so the planner / pool view inherits the correct number
-- automatically.
CREATE OR REPLACE FUNCTION public.pm_sync_weekly_capacity_from_collaborator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.daily_hours IS DISTINCT FROM OLD.daily_hours)
     OR (NEW.days_per_week IS DISTINCT FROM OLD.days_per_week) THEN
    UPDATE public.pm_resources
       SET weekly_capacity = NEW.daily_hours * NEW.days_per_week,
           updated_at = now()
     WHERE collaborator_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_sync_weekly_capacity ON public.collaborators;
CREATE TRIGGER trg_pm_sync_weekly_capacity
AFTER UPDATE OF daily_hours, days_per_week ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.pm_sync_weekly_capacity_from_collaborator();