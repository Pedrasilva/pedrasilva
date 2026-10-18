CREATE OR REPLACE FUNCTION public.pm_ensure_timesheet_task(_resource_id uuid, _stage_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid; target pm_stages; task_id uuid; allocation_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 me:=public.pm_get_my_resource_id();
 IF me IS NULL OR me IS DISTINCT FROM _resource_id THEN RAISE EXCEPTION 'Only your own timesheet can be prepared' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO target FROM pm_stages s JOIN pm_projects p ON p.id=s.project_id WHERE s.id=_stage_id AND p.status='active' AND s.archived_at IS NULL AND s.is_self IS DISTINCT FROM false AND NOT EXISTS(SELECT 1 FROM pm_stages c WHERE c.parent_stage_id=s.id) AND (s.status='active' OR EXISTS(SELECT 1 FROM pm_stages par WHERE par.id=s.parent_stage_id AND par.stage_kind='retainer_monthly')) AND (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard') OR public.has_permission(auth.uid(),'projects.financials') OR public.has_permission(auth.uid(),'projects.all') OR public.has_module_permission(auth.uid(),'projects.view','all') OR (public.has_module_permission(auth.uid(),'projects.view','assigned') AND public.pm_has_assigned_access(auth.uid(),p.id)) OR (public.has_module_permission(auth.uid(),'projects.view','own') AND public.pm_is_retainer_stage(s.id)) OR public.is_psa_staff());
 IF target.id IS NULL THEN RAISE EXCEPTION 'Stage is not available for new timesheet activities' USING ERRCODE='22023'; END IF;
 -- Serialise all preparation calls for the same person/stage; never merge allocations or tasks.
 PERFORM pg_advisory_xact_lock(hashtextextended('timesheet-task:'||me::text||':'||_stage_id::text,0));
 SELECT t.id INTO task_id FROM pm_tasks t JOIN pm_allocations a ON a.id=t.allocation_id WHERE a.resource_id=me AND a.stage_id=_stage_id ORDER BY a.created_at,a.id,t.created_at,t.id LIMIT 1;
 IF task_id IS NOT NULL THEN RETURN task_id; END IF;
 -- Reuse an existing allocation even if no task exists; never modify its dates/lock/status.
 SELECT a.id INTO allocation_id FROM pm_allocations a WHERE a.resource_id=me AND a.stage_id=_stage_id ORDER BY a.created_at,a.id LIMIT 1;
 IF allocation_id IS NULL THEN
  INSERT INTO pm_allocations(resource_id,stage_id,start_date,end_date,hours_per_day,source,planning_removed_at)
   VALUES(me,_stage_id,target.start_date,target.end_date,0,'timesheet_link',clock_timestamp()) RETURNING id INTO allocation_id;
  SELECT id INTO task_id FROM pm_tasks WHERE pm_tasks.allocation_id=allocation_id ORDER BY created_at,id LIMIT 1;
 END IF;
 IF task_id IS NULL THEN INSERT INTO pm_tasks(allocation_id,name,status) VALUES(allocation_id,target.name,'pending') RETURNING id INTO task_id; END IF;
 RETURN task_id;
END $$;
REVOKE ALL ON FUNCTION public.pm_ensure_timesheet_task(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_ensure_timesheet_task(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.pm_ensure_timesheet_task(uuid,uuid) IS 'Own active-stage timesheet preparation: deterministic task reuse; missing links are retired zero-hour allocations, never future planning. Existing locks, allocations and activities are unchanged.';