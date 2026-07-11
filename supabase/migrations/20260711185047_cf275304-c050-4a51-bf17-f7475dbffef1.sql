
-- 1. Direct link from a time entry to a project stage (used for retainer logging).
ALTER TABLE public.pm_time_entries
  ADD COLUMN IF NOT EXISTS pm_stage_id uuid REFERENCES public.pm_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pm_time_entries_pm_stage_date_idx
  ON public.pm_time_entries (pm_stage_id, entry_date)
  WHERE pm_stage_id IS NOT NULL;

-- 2. Helper: is this stage a project-side retainer stage (parent or child)?
CREATE OR REPLACE FUNCTION public.pm_is_retainer_stage(_stage_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pm_stages s
    LEFT JOIN public.pm_stages p ON p.id = s.parent_stage_id
    WHERE s.id = _stage_id
      AND (
        s.stage_kind IN ('retainer_monthly', 'retainer_month', 'retainer')
        OR p.stage_kind IN ('retainer_monthly', 'retainer')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.pm_is_retainer_stage(uuid) TO authenticated, anon;

-- 3. Open visibility for retainer entries: everyone on the team needs to see
--    each other's clocked hours in the retainer monitor.
DROP POLICY IF EXISTS "Retainer entries visible to team" ON public.pm_time_entries;
CREATE POLICY "Retainer entries visible to team"
  ON public.pm_time_entries
  FOR SELECT
  TO authenticated
  USING (
    entry_type = 'retainer'
    AND pm_stage_id IS NOT NULL
    AND public.pm_is_retainer_stage(pm_stage_id)
  );

-- 4. Open write: any signed-in user can insert their own retainer entry
--    against a retainer stage without being pre-allocated.
DROP POLICY IF EXISTS "Users log own retainer hours to any retainer stage" ON public.pm_time_entries;
CREATE POLICY "Users log own retainer hours to any retainer stage"
  ON public.pm_time_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    entry_type = 'retainer'
    AND user_id = auth.uid()
    AND pm_stage_id IS NOT NULL
    AND public.pm_is_retainer_stage(pm_stage_id)
  );
