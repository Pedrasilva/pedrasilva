CREATE OR REPLACE FUNCTION public.pm_project_stage_locked_cost(p_project_id uuid)
RETURNS TABLE(stage_id uuid, month text, snap_cost numeric, unsnap_hours numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH entries AS (
    SELECT coalesce(te.pm_stage_id, st.id) AS stage_id,
           to_char(te.entry_date, 'YYYY-MM') AS month,
           te.hours, te.cost_rate_snapshot
      FROM public.pm_time_entries te
      LEFT JOIN public.pm_tasks t ON t.id = te.task_id
      LEFT JOIN public.pm_allocations al ON al.id = t.allocation_id
      LEFT JOIN public.pm_stages st ON st.id = al.stage_id
     WHERE te.entry_type = 'project'
       AND (te.pm_stage_id IN (SELECT s.id FROM public.pm_stages s WHERE s.project_id = p_project_id)
            OR st.project_id = p_project_id)
  )
  SELECT e.stage_id, e.month,
         sum(CASE WHEN e.cost_rate_snapshot IS NOT NULL THEN e.hours * e.cost_rate_snapshot ELSE 0 END)::numeric,
         sum(CASE WHEN e.cost_rate_snapshot IS NULL THEN e.hours ELSE 0 END)::numeric
    FROM entries e
   WHERE public.pm_can_see_project_financials(auth.uid()) AND e.stage_id IS NOT NULL
   GROUP BY e.stage_id, e.month
$$;
REVOKE ALL ON FUNCTION public.pm_project_stage_locked_cost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_project_stage_locked_cost(uuid) TO authenticated;