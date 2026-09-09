ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS work_profile text NOT NULL DEFAULT 'project';

ALTER TABLE public.collaborators
  DROP CONSTRAINT IF EXISTS collaborators_work_profile_check;

ALTER TABLE public.collaborators
  ADD CONSTRAINT collaborators_work_profile_check
  CHECK (work_profile IN ('project', 'mixed', 'support'));

COMMENT ON COLUMN public.collaborators.work_profile IS
  'Timesheet UX default only (project | mixed | support). Never used in costing/pricing formulas.';