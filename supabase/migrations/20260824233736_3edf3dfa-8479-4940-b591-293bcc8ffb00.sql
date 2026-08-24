CREATE OR REPLACE FUNCTION public.pm_assigned_project_ids(_user_id uuid)
 RETURNS TABLE(project_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT s.project_id
  FROM public.pm_allocations a
  JOIN public.pm_stages s ON s.id = a.stage_id
  WHERE a.resource_id = public.pm_resource_id_for_user(_user_id)
    AND s.project_id IS NOT NULL
  UNION
  SELECT DISTINCT s.project_id
  FROM public.pm_time_entries te
  LEFT JOIN public.pm_tasks tk ON tk.id = te.task_id
  LEFT JOIN public.pm_allocations a2 ON a2.id = tk.allocation_id
  JOIN public.pm_stages s ON s.id = COALESCE(te.pm_stage_id, a2.stage_id)
  WHERE te.user_id = _user_id
    AND te.entry_type IN ('project','retainer')
    AND s.project_id IS NOT NULL
  UNION
  -- 3) explicit project team membership (manager / coordinator / co-author / support)
  SELECT DISTINCT t.project_id
  FROM public.pm_project_team t
  WHERE t.resource_id = public.pm_resource_id_for_user(_user_id)
    AND t.project_id IS NOT NULL
$function$;