CREATE OR REPLACE FUNCTION public.pm_assigned_project_ids(_user_id uuid)
RETURNS TABLE(project_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- 1) formal staffing via allocations
  SELECT DISTINCT s.project_id
  FROM public.pm_allocations a
  JOIN public.pm_stages s ON s.id = a.stage_id
  WHERE a.resource_id = public.pm_resource_id_for_user(_user_id)
    AND s.project_id IS NOT NULL
  UNION
  -- 2) direct stage-level time logging (stage ref or task -> allocation -> stage)
  SELECT DISTINCT s.project_id
  FROM public.pm_time_entries te
  LEFT JOIN public.pm_tasks tk ON tk.id = te.task_id
  LEFT JOIN public.pm_allocations a2 ON a2.id = tk.allocation_id
  JOIN public.pm_stages s ON s.id = COALESCE(te.pm_stage_id, a2.stage_id)
  WHERE te.user_id = _user_id
    AND te.entry_type IN ('project','retainer')
    AND s.project_id IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.pm_team_resource_ids(_user_id uuid)
RETURNS TABLE(resource_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT a.resource_id
  FROM public.pm_allocations a
  JOIN public.pm_stages s ON s.id = a.stage_id
  WHERE s.project_id IN (SELECT p.project_id FROM public.pm_assigned_project_ids(_user_id) p)
    AND a.resource_id IS NOT NULL
  UNION
  SELECT DISTINCT public.pm_resource_id_for_user(te.user_id)
  FROM public.pm_time_entries te
  LEFT JOIN public.pm_tasks tk ON tk.id = te.task_id
  LEFT JOIN public.pm_allocations a2 ON a2.id = tk.allocation_id
  JOIN public.pm_stages s ON s.id = COALESCE(te.pm_stage_id, a2.stage_id)
  WHERE te.entry_type IN ('project','retainer')
    AND s.project_id IN (SELECT p.project_id FROM public.pm_assigned_project_ids(_user_id) p)
    AND public.pm_resource_id_for_user(te.user_id) IS NOT NULL
$function$;