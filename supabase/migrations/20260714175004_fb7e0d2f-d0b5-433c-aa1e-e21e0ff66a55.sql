-- 1. Replace the retainer-team SELECT policy so it matches how the app actually
--    logs retainer hours. `LogRetainerHoursDialog` inserts entries with
--    entry_type='project' + pm_stage_id set (task_id null), which the validate
--    trigger requires on the retainer_month branch. The old policy filtered on
--    entry_type='retainer' which no insert path produces, so only the row's
--    author (via the user-own SELECT policy) and admins could ever see it.
DROP POLICY IF EXISTS "Retainer entries visible to team" ON public.pm_time_entries;
CREATE POLICY "Retainer entries visible to team"
  ON public.pm_time_entries
  FOR SELECT
  TO authenticated
  USING (
    pm_stage_id IS NOT NULL
    AND public.pm_is_retainer_stage(pm_stage_id)
  );

-- 2. Resolve auth.users -> pm_resources by email so the client can attribute
--    directly-logged retainer entries (which only carry user_id) to the right
--    resource in the "By resource" breakdown / month drill-down.
CREATE OR REPLACE FUNCTION public.pm_resource_map_for_users(_user_ids uuid[])
RETURNS TABLE(user_id uuid, resource_id uuid, name text, cost_rate numeric, sale_rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         r.id,
         COALESCE(NULLIF(r.full_name, ''), r.name),
         r.cost_rate,
         r.hourly_rate
  FROM auth.users u
  JOIN public.pm_resources r ON lower(r.email) = lower(u.email)
  WHERE u.id = ANY(_user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.pm_resource_map_for_users(uuid[]) TO authenticated;