CREATE OR REPLACE FUNCTION public.pm_week_board(_week_start date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb; planner boolean;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _week_start IS NULL OR extract(isodow from _week_start)<>1 THEN RAISE EXCEPTION 'Week must start on Monday'; END IF;
planner := public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all');
WITH resources AS (SELECT r.id,r.name,r.color,r.collaborator_id,r.weekly_capacity FROM public.pm_resources r WHERE r.active=true),
projects AS (SELECT p.id,p.name,p.client,p.color FROM public.pm_projects p WHERE p.status='active'),
stages AS (SELECT s.id,s.project_id,s.name,s.start_date,s.end_date,s.sort_order,s.parent_stage_id,s.stage_kind,s.is_milestone,s.is_self FROM public.pm_stages s JOIN projects p ON p.id=s.project_id WHERE NOT coalesce(s.is_milestone,false) AND coalesce(s.stage_kind,'')<>'retainer_monthly' AND s.archived_at IS NULL AND coalesce(s.status::text,'planned')<>'cancelled' AND NOT EXISTS(SELECT 1 FROM public.pm_stages child WHERE child.parent_stage_id=s.id AND child.archived_at IS NULL AND coalesce(child.status::text,'planned')<>'cancelled')),
allocations AS (SELECT a.id,a.resource_id,a.stage_id,s.project_id,a.start_date,a.end_date,a.hours_per_day,a.day_part,a.is_site_visit,a.status,a.is_locked,a.source FROM public.pm_allocations a JOIN stages s ON s.id=a.stage_id JOIN resources r ON r.id=a.resource_id WHERE a.planning_removed_at IS NULL AND a.start_date<=_week_start+6 AND a.end_date>=_week_start),
days AS (SELECT _week_start+i AS day FROM generate_series(0,4) i),
leave_days AS (SELECT DISTINCT r.id AS resource_id,d.day,'leave'::text AS kind,NULL::text AS name FROM resources r JOIN public.vacation_requests v ON v.collaborator_id=r.collaborator_id JOIN days d ON d.day BETWEEN v.data_inicio AND v.data_fim WHERE v.estado IN ('aprovada','aprovado') UNION ALL SELECT r.id,d.day,'holiday',h.nome FROM resources r CROSS JOIN days d JOIN public.holidays h ON h.data=d.day)
SELECT jsonb_build_object('resources',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM resources r),'[]'::jsonb),'projects',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name) FROM projects p),'[]'::jsonb),'stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sort_order) FROM stages s),'[]'::jsonb),'stage_tree',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'project_id',s.project_id,'parent_stage_id',s.parent_stage_id,'sort_order',s.sort_order)) FROM public.pm_stages s JOIN projects p ON p.id=s.project_id WHERE s.archived_at IS NULL AND coalesce(s.status::text,'planned')<>'cancelled'),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM allocations a),'[]'::jsonb),'leave',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM leave_days l),'[]'::jsonb),'plan',(SELECT jsonb_build_object('id',p.id,'status',CASE WHEN planner THEN p.status ELSE 'approved' END,'approved_by',p.approved_by,'approved_by_name',(SELECT nome FROM collaborators c JOIN auth.users u ON lower(u.email)=lower(c.email) WHERE u.id=p.approved_by LIMIT 1),'approved_at',p.approved_at,'updated_at',p.updated_at,'updated_by_name',p.updated_by_name,'notes',CASE WHEN planner THEN p.notes ELSE '[]'::jsonb END) FROM public.pm_week_plans p WHERE p.week_start=_week_start AND (planner OR p.status='approved' OR EXISTS(SELECT 1 FROM pm_week_publications h WHERE h.plan_id=p.id))),'draft_slots',CASE WHEN planner THEN coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.pm_week_plan_slots s JOIN public.pm_week_plans p ON p.id=s.plan_id WHERE p.week_start=_week_start),'[]'::jsonb) ELSE '[]'::jsonb END,'my_collaborator_id',public.get_my_collaborator_id()) INTO result;
RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.pm_week_draft(_week_start date,_action text,_changes jsonb DEFAULT '[]',_expected_updated_at timestamptz DEFAULT NULL,_notes jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p pm_week_plans; c jsonb; current_slot jsonb; after_slot jsonb; conflicts integer:=0; rid uuid; d date; half text; made boolean:=false;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT(public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _week_start IS NULL OR extract(isodow from _week_start)<>1 OR _action NOT IN ('create','save','discard') OR jsonb_typeof(_changes)<>'array' OR jsonb_array_length(_changes)>500 THEN RAISE EXCEPTION 'Invalid draft request'; END IF;
IF _action='create' THEN INSERT INTO pm_week_plans(week_start) VALUES(_week_start) ON CONFLICT(week_start) DO NOTHING RETURNING * INTO p; made:=FOUND; END IF;
SELECT * INTO p FROM pm_week_plans WHERE week_start=_week_start FOR UPDATE;
IF p.id IS NULL THEN RAISE EXCEPTION 'Draft no longer exists'; END IF;
IF p.status<>'draft' THEN RAISE EXCEPTION 'Draft editing only'; END IF;
IF _action='discard' THEN
IF _expected_updated_at IS DISTINCT FROM p.updated_at THEN RAISE EXCEPTION 'Draft changed; reload before discarding'; END IF;
IF EXISTS(SELECT 1 FROM pm_week_publications h WHERE h.plan_id=p.id) THEN
PERFORM set_config('app.pm_week_plan_apply','1',true);
DELETE FROM pm_week_plan_slots WHERE plan_id=p.id;
INSERT INTO pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id,is_site_visit) SELECT p.id,(e->>'resource_id')::uuid,(e->>'day')::date,e->>'part',(e->>'project_id')::uuid,(e->>'stage_id')::uuid,(e->>'is_site_visit')::boolean FROM jsonb_array_elements((SELECT published_slots FROM pm_week_publications WHERE plan_id=p.id ORDER BY approved_at DESC LIMIT 1)) e;
UPDATE pm_week_plans SET status='approved',notes='[]' WHERE id=p.id;
PERFORM set_config('app.pm_week_plan_apply','0',true);
ELSE DELETE FROM pm_week_plans WHERE id=p.id; END IF;
RETURN jsonb_build_object('board',public.pm_week_board(_week_start),'conflicts',0);
END IF;
IF _action='save' OR made THEN
FOR c IN SELECT value FROM jsonb_array_elements(_changes) LOOP
rid:=(c->>'resource_id')::uuid; d:=(c->>'day')::date; half:=c->>'part';
IF half NOT IN ('am','pm') OR d NOT BETWEEN p.week_start AND p.week_start+4 THEN RAISE EXCEPTION 'Invalid slot'; END IF;
IF EXISTS(SELECT 1 FROM holidays WHERE data=d) OR EXISTS(SELECT 1 FROM vacation_requests v JOIN pm_resources r ON r.collaborator_id=v.collaborator_id WHERE r.id=rid AND v.estado IN ('aprovada','aprovado') AND d BETWEEN v.data_inicio AND v.data_fim) THEN RAISE EXCEPTION 'Leave and holidays cannot be painted'; END IF;
SELECT jsonb_build_object('project_id',s.project_id,'stage_id',s.stage_id,'is_site_visit',s.is_site_visit) INTO current_slot FROM pm_week_plan_slots s WHERE s.plan_id=p.id AND s.resource_id=rid AND s.day=d AND s.part=half;
IF _action='save' AND coalesce(current_slot,'null'::jsonb) IS DISTINCT FROM coalesce(c->'before','null'::jsonb) THEN conflicts:=conflicts+1; END IF;
after_slot:=c->'after';
IF after_slot IS NULL OR after_slot='null'::jsonb THEN DELETE FROM pm_week_plan_slots WHERE plan_id=p.id AND resource_id=rid AND day=d AND part=half;
ELSE INSERT INTO pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id,is_site_visit) VALUES(p.id,rid,d,half,(after_slot->>'project_id')::uuid,(after_slot->>'stage_id')::uuid,coalesce((after_slot->>'is_site_visit')::boolean,false)) ON CONFLICT(plan_id,resource_id,day,part) DO UPDATE SET project_id=excluded.project_id,stage_id=excluded.stage_id,is_site_visit=excluded.is_site_visit; END IF;
END LOOP;
UPDATE pm_week_plans SET notes=CASE WHEN _notes IS NULL THEN notes ELSE (SELECT coalesce(jsonb_agg(v),'[]'::jsonb) FROM (SELECT DISTINCT value AS v FROM jsonb_array_elements(notes||_notes)) n) END WHERE id=p.id RETURNING * INTO p;
END IF;
RETURN jsonb_build_object('board',public.pm_week_board(_week_start),'plan',to_jsonb(p),'conflicts',conflicts,'created',made);
END $$;