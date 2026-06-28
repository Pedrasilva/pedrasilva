
ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_project_id uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fee_proposals_locked_project_idx
  ON public.fee_proposals(locked_project_id);

-- Backfill: any approved quote already linked to a project is locked.
UPDATE public.fee_proposals
SET is_locked = true,
    locked_at = COALESCE(locked_at, approved_at, now()),
    locked_project_id = COALESCE(locked_project_id, pm_project_id)
WHERE quote_status = 'approved'
  AND pm_project_id IS NOT NULL
  AND is_locked = false;

CREATE OR REPLACE FUNCTION public.fee_proposals_autolock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_status = 'approved' AND NEW.pm_project_id IS NOT NULL AND NEW.is_locked = false THEN
    NEW.is_locked := true;
    NEW.locked_at := COALESCE(NEW.locked_at, now());
    NEW.locked_project_id := COALESCE(NEW.locked_project_id, NEW.pm_project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_proposals_autolock_trg ON public.fee_proposals;
CREATE TRIGGER fee_proposals_autolock_trg
BEFORE INSERT OR UPDATE OF quote_status, pm_project_id, is_locked
ON public.fee_proposals
FOR EACH ROW
EXECUTE FUNCTION public.fee_proposals_autolock();
