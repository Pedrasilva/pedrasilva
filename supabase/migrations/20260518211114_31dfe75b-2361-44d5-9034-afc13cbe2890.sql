-- Phase 1: Planning eligibility flag on collaborators.
-- Additive boolean that drives which collaborators appear in the
-- Quote Planner Team Pool and other allocation surfaces. Defaults to
-- true so existing behaviour is preserved for unmanaged rows; a
-- one-time backfill flips Backoffice collaborators to false to clear
-- the current bug where BO/admin staff pollute the delivery pool.
-- Operational/project-delivery membership (e.g. Projecto vs Backoffice)
-- is still owned by `departamento`; this flag is the explicit planning
-- override admins can edit per person.

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS include_in_planning boolean NOT NULL DEFAULT true;

-- One-time backfill: BO staff are not project-delivery resources.
UPDATE public.collaborators
   SET include_in_planning = false
 WHERE departamento = 'Backoffice'
   AND include_in_planning = true;

CREATE INDEX IF NOT EXISTS idx_collaborators_include_in_planning
  ON public.collaborators (include_in_planning)
  WHERE archived_at IS NULL AND include_in_planning = true;