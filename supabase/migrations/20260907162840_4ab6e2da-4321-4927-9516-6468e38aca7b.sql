-- Faster read policies on pm_time_entries: hoist permission checks out of the
-- per-row path (InitPlan via scalar subselects) and replace per-row team
-- function calls with a set-membership test. Same visibility as before.

DROP POLICY IF EXISTS "Users see own time entries + admins all" ON public.pm_time_entries;
DROP POLICY IF EXISTS "Approvers read all time entries" ON public.pm_time_entries;
DROP POLICY IF EXISTS "Retainer entries visible to project team" ON public.pm_time_entries;

CREATE POLICY "Time entries readable by owner, admins, team and approvers"
ON public.pm_time_entries
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_module_permission((SELECT auth.uid()), 'timesheets.view_team', 'all'))
  OR (SELECT public.has_module_permission((SELECT auth.uid()), 'timesheets.approve', 'all'))
  OR (
    (
      (SELECT public.has_module_permission((SELECT auth.uid()), 'timesheets.view_team', 'team'))
      OR (SELECT public.has_module_permission((SELECT auth.uid()), 'timesheets.approve', 'team'))
    )
    AND user_id IN (SELECT t.user_id FROM public.pm_team_user_ids((SELECT auth.uid())) t)
  )
);

CREATE POLICY "Retainer entries visible to project team"
ON public.pm_time_entries
FOR SELECT
TO authenticated
USING (
  pm_stage_id IS NOT NULL
  AND public.pm_is_retainer_stage(pm_stage_id)
  AND EXISTS (
    SELECT 1
    FROM public.pm_stages target_stage
    JOIN public.pm_stages sibling ON sibling.project_id = target_stage.project_id
    JOIN public.pm_allocations a ON a.stage_id = sibling.id
    WHERE target_stage.id = pm_time_entries.pm_stage_id
      AND a.resource_id = (SELECT public.pm_get_my_resource_id())
  )
);

CREATE INDEX IF NOT EXISTS pm_time_entries_type_task_idx
  ON public.pm_time_entries (entry_type, task_id);
