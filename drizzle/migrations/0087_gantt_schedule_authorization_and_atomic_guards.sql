CREATE OR REPLACE FUNCTION public.pm_gantt_state(_mode text,_scope uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE result jsonb; revision_data jsonb;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _mode='quote' THEN
IF NOT EXISTS(SELECT 1 FROM fee_proposals WHERE id=_scope) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
revision_data:=jsonb_build_object('stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM quote_stages s WHERE quote_id=_scope),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM quote_allocations a WHERE quote_id=_scope),'[]'::jsonb),'dependencies',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM quote_stage_dependencies d WHERE quote_id=_scope),'[]'::jsonb),'quote',(SELECT to_jsonb(q) FROM fee_proposals q WHERE id=_scope),'relative',EXISTS(SELECT 1 FROM quote_relative_schedules WHERE quote_id=_scope));
result:=jsonb_build_object('stages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'parent_stage_id',parent_stage_id,'start_date',start_date,'end_date',end_date,'stage_kind',stage_kind) ORDER BY id) FROM quote_stages WHERE quote_id=_scope),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'stage_id',stage_id,'start_date',start_date,'end_date',end_date) ORDER BY id) FROM quote_allocations WHERE quote_id=_scope),'[]'::jsonb),'dependencies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'predecessor_id',predecessor_stage_id,'successor_id',successor_stage_id,'type',type,'lag_days',lag_days) ORDER BY id) FROM quote_stage_dependencies WHERE quote_id=_scope),'[]'::jsonb),'relative',revision_data->'relative','holidays','[]'::jsonb);
ELSIF _mode='project' THEN
IF NOT EXISTS(SELECT 1 FROM pm_projects WHERE id=_scope) OR NOT (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.view','all') OR (public.has_module_permission(auth.uid(),'projects.view','assigned') AND public.pm_has_assigned_access(auth.uid(),_scope)) OR public.pm_can_view_projects(auth.uid())) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF EXISTS(SELECT 1 FROM pm_stage_dependencies d JOIN pm_stages p ON p.id=d.predecessor_id JOIN pm_stages s ON s.id=d.successor_id WHERE (p.project_id=_scope OR s.project_id=_scope) AND p.project_id<>s.project_id) THEN RAISE EXCEPTION 'gantt.schedule.crossProject'; END IF;
revision_data:=jsonb_build_object('stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM pm_stages s WHERE project_id=_scope),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM pm_allocations a JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id=_scope AND a.planning_removed_at IS NULL),'[]'::jsonb),'dependencies',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM pm_stage_dependencies d JOIN pm_stages s ON s.id=d.predecessor_id WHERE s.project_id=_scope),'[]'::jsonb),'holidays',coalesce((SELECT jsonb_agg(data ORDER BY data) FROM holidays),'[]'::jsonb));
result:=jsonb_build_object('stages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'parent_stage_id',parent_stage_id,'start_date',start_date,'end_date',end_date,'is_locked',is_locked,'stage_kind',stage_kind) ORDER BY id) FROM pm_stages WHERE project_id=_scope),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'stage_id',a.stage_id,'start_date',a.start_date,'end_date',a.end_date,'is_locked',a.is_locked,'source',a.source,'external_id',a.external_id) ORDER BY a.id) FROM pm_allocations a JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id=_scope AND a.planning_removed_at IS NULL),'[]'::jsonb),'dependencies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'predecessor_id',d.predecessor_id,'successor_id',d.successor_id,'type',d.type,'lag_days',d.lag_days) ORDER BY d.id) FROM pm_stage_dependencies d JOIN pm_stages s ON s.id=d.predecessor_id WHERE s.project_id=_scope),'[]'::jsonb),'relative',false,'holidays',revision_data->'holidays');
ELSE RAISE EXCEPTION 'Invalid mode'; END IF;
RETURN result||jsonb_build_object('revision',md5(revision_data::text));
END $fn$;
REVOKE ALL ON FUNCTION public.pm_gantt_state(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_gantt_state(text,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pm_gantt_save(_mode text,_scope uuid,_revision text,_patch jsonb,_initialize boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE before_state jsonb; after_state jsonb; r jsonb; n integer; ids uuid[]; dep_changed boolean; stages_changed boolean; allocs_changed boolean;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _mode NOT IN ('quote','project') OR jsonb_typeof(_patch)<>'object' THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
IF NOT pg_try_advisory_xact_lock(hashtextextended('gantt:'||_mode||':'||_scope::text,0)) THEN RAISE EXCEPTION 'gantt.schedule.busy'; END IF;
IF _mode='project' THEN LOCK TABLE pm_stages,pm_allocations,pm_stage_dependencies IN SHARE ROW EXCLUSIVE MODE;
ELSE LOCK TABLE fee_proposals,quote_stages,quote_allocations,quote_stage_dependencies IN SHARE ROW EXCLUSIVE MODE;
IF EXISTS(SELECT 1 FROM fee_proposals WHERE id=_scope AND (is_locked OR pm_project_id IS NOT NULL)) THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF; END IF;
before_state:=public.pm_gantt_state(_mode,_scope);
IF before_state->>'revision' IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
stages_changed:=jsonb_array_length(coalesce(_patch->'stages','[]'::jsonb))>0;
allocs_changed:=jsonb_array_length(coalesce(_patch->'allocations','[]'::jsonb))>0;
dep_changed:=_patch ? 'dependencies' AND _patch->'dependencies' IS DISTINCT FROM before_state->'dependencies';
IF _mode='project' AND NOT public.has_role(auth.uid(),'admin') THEN
IF (stages_changed OR dep_changed) AND NOT (public.has_module_permission(auth.uid(),'projects.edit_stages','all') OR (public.has_module_permission(auth.uid(),'projects.edit_stages','assigned') AND public.pm_has_assigned_access(auth.uid(),_scope))) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF allocs_changed AND NOT (public.has_module_permission(auth.uid(),'projects.edit_planning','all') OR (public.has_module_permission(auth.uid(),'projects.edit_planning','assigned') AND public.pm_has_assigned_access(auth.uid(),_scope))) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; END IF;
IF _initialize THEN
IF _mode<>'quote' OR EXISTS(SELECT 1 FROM quote_relative_schedules WHERE quote_id=_scope) THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
INSERT INTO quote_relative_schedules(quote_id,original_dates) VALUES(_scope,before_state); END IF;
FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_patch->'stages','[]'::jsonb)) LOOP
IF r->>'start_date' IS NULL OR r->>'end_date' IS NULL OR (r->>'end_date')::date<(r->>'start_date')::date THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
IF _mode='quote' THEN UPDATE quote_stages SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date,manual_override=true WHERE id=(r->>'id')::uuid AND quote_id=_scope;
ELSE IF EXISTS(SELECT 1 FROM pm_stages WHERE id=(r->>'id')::uuid AND is_locked) THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF;
UPDATE pm_stages SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND project_id=_scope; END IF;
GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF; END LOOP;
FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_patch->'allocations','[]'::jsonb)) LOOP
IF r->>'start_date' IS NULL OR r->>'end_date' IS NULL OR (r->>'end_date')::date<(r->>'start_date')::date THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
IF _mode='quote' THEN UPDATE quote_allocations SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND quote_id=_scope;
ELSE IF EXISTS(SELECT 1 FROM pm_allocations WHERE id=(r->>'id')::uuid AND (is_locked OR external_id IS NOT NULL OR source IN('import','imported_accelo'))) THEN RAISE EXCEPTION 'gantt.schedule.lockedAllocation'; END IF;
UPDATE pm_allocations SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND planning_removed_at IS NULL AND stage_id IN(SELECT id FROM pm_stages WHERE project_id=_scope); END IF;
GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF; END LOOP;
IF dep_changed THEN
IF EXISTS(SELECT 1 FROM jsonb_array_elements(_patch->'dependencies') d WHERE d->>'predecessor_id'=d->>'successor_id' OR d->>'type' NOT IN('FS','SS','FF','SF') OR d->>'lag_days' IS NULL OR abs((d->>'lag_days')::integer)>36600) OR EXISTS(SELECT 1 FROM jsonb_array_elements(_patch->'dependencies') d GROUP BY d->>'predecessor_id',d->>'successor_id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(_patch->'dependencies') d GROUP BY d->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'gantt.schedule.invalidLink'; END IF;
IF EXISTS(WITH RECURSIVE edges(a,b) AS (SELECT d->>'predecessor_id',d->>'successor_id' FROM jsonb_array_elements(_patch->'dependencies') d UNION ALL SELECT s->>'id',s->>'parent_stage_id' FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'parent_stage_id' IS NOT NULL), paths(a,b,seen,cycle) AS (SELECT a,b,ARRAY[a,b],a=b FROM edges UNION ALL SELECT p.a,e.b,p.seen||e.b,e.b=ANY(p.seen) FROM paths p JOIN edges e ON p.b=e.a WHERE NOT p.cycle) SELECT 1 FROM paths WHERE cycle) THEN RAISE EXCEPTION 'gantt.schedule.cycle'; END IF;
SELECT coalesce(array_agg((value->>'id')::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements(_patch->'dependencies');
IF _mode='quote' THEN DELETE FROM quote_stage_dependencies WHERE quote_id=_scope AND NOT(id=ANY(ids)); ELSE DELETE FROM pm_stage_dependencies WHERE predecessor_id IN(SELECT id FROM pm_stages WHERE project_id=_scope) AND NOT(id=ANY(ids)); END IF;
FOR r IN SELECT value FROM jsonb_array_elements(_patch->'dependencies') LOOP
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=r->>'predecessor_id') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=r->>'successor_id') THEN RAISE EXCEPTION 'gantt.schedule.invalidLink'; END IF;
IF _mode='quote' THEN INSERT INTO quote_stage_dependencies(id,quote_id,predecessor_stage_id,successor_stage_id,type,lag_days) VALUES((r->>'id')::uuid,_scope,(r->>'predecessor_id')::uuid,(r->>'successor_id')::uuid,(r->>'type')::quote_dep_type,(r->>'lag_days')::integer) ON CONFLICT(id) DO UPDATE SET type=excluded.type,lag_days=excluded.lag_days,predecessor_stage_id=excluded.predecessor_stage_id,successor_stage_id=excluded.successor_stage_id WHERE quote_stage_dependencies.quote_id=_scope;
ELSE INSERT INTO pm_stage_dependencies(id,predecessor_id,successor_id,type,lag_days) VALUES((r->>'id')::uuid,(r->>'predecessor_id')::uuid,(r->>'successor_id')::uuid,(r->>'type')::pm_dep_type,(r->>'lag_days')::integer) ON CONFLICT(id) DO UPDATE SET type=excluded.type,lag_days=excluded.lag_days,predecessor_id=excluded.predecessor_id,successor_id=excluded.successor_id WHERE pm_stage_dependencies.predecessor_id IN(SELECT id FROM pm_stages WHERE project_id=_scope); END IF;
GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF; END LOOP; END IF;
after_state:=public.pm_gantt_state(_mode,_scope);
RETURN jsonb_build_object('before',before_state,'after',after_state);
END $fn$;
REVOKE ALL ON FUNCTION public.pm_gantt_save(text,uuid,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_gantt_save(text,uuid,text,jsonb,boolean) TO authenticated,service_role;
REVOKE INSERT ON public.quote_relative_schedules FROM authenticated;
COMMENT ON FUNCTION public.pm_gantt_save(text,uuid,text,jsonb,boolean) IS 'Atomic scheduling with verified PSA identity, existing stage/planning scopes, safe state projection, revision and overlap protection; no timesheet or weekly writes.';