-- Add archived_at to salary_snapshots and a transactional RPC to promote one
-- snapshot as "in force" while demoting the previous one.

ALTER TABLE public.salary_snapshots
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_salary_snapshots_archived_at
  ON public.salary_snapshots (collaborator_id) WHERE archived_at IS NULL;

-- Promote a snapshot as the in-force one starting on p_from. All other
-- snapshots for the same collaborator are demoted: is_effective=false and
-- their effective_to is closed at p_from - 1 day (only when still null/open).
CREATE OR REPLACE FUNCTION public.set_snapshot_in_force(
  p_snapshot_id uuid,
  p_from date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collab uuid;
BEGIN
  SELECT collaborator_id INTO v_collab
  FROM public.salary_snapshots
  WHERE id = p_snapshot_id;

  IF v_collab IS NULL THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;

  -- Demote any other in-force snapshot for this collaborator
  UPDATE public.salary_snapshots
  SET is_effective = false,
      effective_to = COALESCE(effective_to, (p_from - INTERVAL '1 day')::date),
      updated_at = now()
  WHERE collaborator_id = v_collab
    AND id <> p_snapshot_id
    AND is_effective = true;

  -- Promote the target snapshot
  UPDATE public.salary_snapshots
  SET is_effective = true,
      effective_from = p_from,
      effective_to = NULL,
      archived_at = NULL,
      updated_at = now()
  WHERE id = p_snapshot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_snapshot_in_force(uuid, date) TO authenticated;
