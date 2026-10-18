-- Total logged hours behind one allocation (hours only, no costs), so planners can choose delete vs retire.
CREATE OR REPLACE FUNCTION public.pm_allocation_logged_hours(_allocation_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT sum(e.hours) FROM public.pm_time_entries e JOIN public.pm_tasks t ON t.id=e.task_id WHERE t.allocation_id=_allocation_id),0);
END $fn$;
REVOKE ALL ON FUNCTION public.pm_allocation_logged_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_allocation_logged_hours(uuid) TO authenticated;