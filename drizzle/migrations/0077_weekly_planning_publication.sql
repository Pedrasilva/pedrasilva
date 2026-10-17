ALTER TABLE public.pm_allocations ADD COLUMN IF NOT EXISTS planning_removed_at timestamptz;
COMMENT ON COLUMN public.pm_allocations.planning_removed_at IS 'Planning retirement preserves task and time-entry history; planning-only queries exclude non-null rows.';
CREATE TABLE public.pm_week_publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_id uuid NOT NULL REFERENCES public.pm_week_plans(id),week_start date NOT NULL,approved_by uuid NOT NULL,approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),preview_token text NOT NULL,summary jsonb NOT NULL,published_slots jsonb NOT NULL);
GRANT SELECT ON public.pm_week_publications TO authenticated;
GRANT ALL ON public.pm_week_publications TO service_role;
REVOKE ALL ON public.pm_week_publications FROM anon,PUBLIC;
ALTER TABLE public.pm_week_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY week_publications_staff ON public.pm_week_publications FOR SELECT TO authenticated USING(public.is_psa_staff());
CREATE OR REPLACE FUNCTION public.pm_week_revision(_plan_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT md5(jsonb_build_object('plan',(SELECT to_jsonb(p) FROM pm_week_plans p WHERE id=_plan_id),'slots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM pm_week_plan_slots s WHERE plan_id=_plan_id),'allocations',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM pm_allocations a),'stages',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM pm_stages s),'resources',(SELECT jsonb_agg(jsonb_build_object('id',id,'active',active,'weekly_capacity',weekly_capacity,'collaborator_id',collaborator_id) ORDER BY id) FROM pm_resources),'projects',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status) ORDER BY id) FROM pm_projects),'leave',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM vacation_requests v),'holidays',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM holidays h),'dependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM pm_stage_dependencies d),'tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM pm_tasks t))::text)
$$;
REVOKE ALL ON FUNCTION public.pm_week_revision(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pm_preview_week_plan(_plan_id uuid,_extensions jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p pm_week_plans; slot record; a record; ext jsonb; s pm_stages; bounds jsonb; resolved jsonb:='[]'; extensions jsonb:='[]'; issues jsonb:='[]'; skipped jsonb:='[]'; overlap jsonb:='[]'; proposed jsonb:='[]'; ops jsonb:='[]'; v jsonb; found_id uuid; matched uuid[]:='{}'; from_day date; to_day date; st uuid; lastrow jsonb; base jsonb; i integer; unchanged integer:=0;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT(public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
SELECT * INTO p FROM pm_week_plans WHERE id=_plan_id;
IF p.id IS NULL OR p.status<>'draft' THEN RAISE EXCEPTION 'Editable draft required'; END IF;
IF jsonb_typeof(_extensions)<>'array' OR jsonb_array_length(_extensions)>50 THEN RAISE EXCEPTION 'Invalid extensions'; END IF;
FOR ext IN SELECT value FROM jsonb_array_elements(_extensions) LOOP
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.notes) n WHERE n=ext) THEN RAISE EXCEPTION 'Extension not in saved intentions'; END IF;
SELECT * INTO s FROM pm_stages WHERE id=(ext->>'stage_id')::uuid AND project_id=(ext->>'project_id')::uuid;
IF s.id IS NULL OR s.archived_at IS NOT NULL OR coalesce(s.is_milestone,false) OR s.stage_kind='retainer_monthly' OR s.status='cancelled' OR EXISTS(SELECT 1 FROM pm_stages c WHERE c.parent_stage_id=s.id AND c.archived_at IS NULL AND c.status<>'cancelled') THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','invalidExtension','stage_id',ext->>'stage_id')); CONTINUE; END IF;
from_day:=least(s.start_date,coalesce((ext->>'from')::date,s.start_date)); to_day:=greatest(s.end_date,(ext->>'until')::date);
IF coalesce(s.is_locked,false) OR EXISTS(SELECT 1 FROM pm_stages par WHERE par.id=s.parent_stage_id AND (from_day<par.start_date OR to_day>par.end_date)) OR EXISTS(SELECT 1 FROM pm_stage_dependencies d JOIN pm_stages x ON x.id=CASE WHEN d.predecessor_id=s.id THEN d.successor_id ELSE d.predecessor_id END WHERE (d.predecessor_id=s.id AND ((d.type='FS' AND x.start_date<to_day+d.lag_days+1) OR (d.type='SS' AND x.start_date<from_day+d.lag_days) OR (d.type='FF' AND x.end_date<to_day+d.lag_days) OR (d.type='SF' AND x.end_date<from_day+d.lag_days))) OR (d.successor_id=s.id AND ((d.type='FS' AND from_day<x.end_date+d.lag_days+1) OR (d.type='SS' AND from_day<x.start_date+d.lag_days) OR (d.type='FF' AND to_day<x.end_date+d.lag_days) OR (d.type='SF' AND to_day<x.start_date+d.lag_days)))) THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','extensionScheduling','stage_id',s.id)); END IF;
extensions:=extensions||jsonb_build_array(ext||jsonb_build_object('start_date',from_day,'end_date',to_day,'old_start',s.start_date,'old_end',s.end_date,'baseline_locked',s.baseline_locked_at IS NOT NULL));
END LOOP;
FOR slot IN SELECT w.* FROM pm_week_plan_slots w WHERE plan_id=p.id ORDER BY resource_id,day,part LOOP
st:=slot.stage_id;
IF st IS NULL THEN SELECT count(*),min(e->>'stage_id')::uuid INTO i,st FROM jsonb_array_elements(extensions) e WHERE (e->>'project_id')::uuid=slot.project_id AND (NOT e?'resource_id' OR (e->>'resource_id')::uuid=slot.resource_id) AND slot.day BETWEEN (e->>'start_date')::date AND (e->>'end_date')::date; IF i<>1 THEN st:=NULL; END IF; END IF;
SELECT * INTO s FROM pm_stages WHERE id=st;
SELECT jsonb_build_object('start_date',min((e->>'start_date')::date),'end_date',max((e->>'end_date')::date)) INTO bounds FROM jsonb_array_elements(extensions) e WHERE (e->>'stage_id')::uuid=st;
IF st IS NULL OR s.id IS NULL OR s.project_id<>slot.project_id OR s.archived_at IS NOT NULL OR coalesce(s.is_milestone,false) OR s.stage_kind='retainer_monthly' OR s.status='cancelled' OR EXISTS(SELECT 1 FROM pm_stages c WHERE c.parent_stage_id=s.id AND c.archived_at IS NULL AND c.status<>'cancelled') OR slot.day NOT BETWEEN coalesce((bounds->>'start_date')::date,s.start_date) AND coalesce((bounds->>'end_date')::date,s.end_date) OR NOT EXISTS(SELECT 1 FROM pm_resources r WHERE r.id=slot.resource_id AND r.active) OR NOT EXISTS(SELECT 1 FROM pm_projects pr WHERE pr.id=slot.project_id AND pr.status='active') OR EXISTS(SELECT 1 FROM holidays h WHERE h.data=slot.day) OR EXISTS(SELECT 1 FROM vacation_requests l JOIN pm_resources r ON r.collaborator_id=l.collaborator_id WHERE r.id=slot.resource_id AND l.estado IN ('aprovada','aprovado') AND slot.day BETWEEN l.data_inicio AND l.data_fim) THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','invalidSlot','resource_id',slot.resource_id,'day',slot.day,'part',slot.part,'stage_id',st)); ELSE resolved:=resolved||jsonb_build_array(to_jsonb(slot)||jsonb_build_object('stage_id',st)); END IF;
END LOOP;
FOR slot IN WITH halves AS (SELECT * FROM jsonb_to_recordset(resolved) AS x(resource_id uuid,day date,part text,stage_id uuid,is_site_visit boolean)), days AS (SELECT resource_id,day,stage_id,is_site_visit,CASE WHEN count(*)=2 THEN 'full' ELSE min(part) END AS part FROM halves GROUP BY resource_id,day,stage_id,is_site_visit) SELECT d.*,CASE WHEN r.weekly_capacity>0 THEN r.weekly_capacity/5 ELSE 8 END*0.75*CASE WHEN d.part='full' THEN 1 ELSE 0.5 END AS hpd FROM days d JOIN pm_resources r ON r.id=d.resource_id ORDER BY resource_id,stage_id,part,is_site_visit,day LOOP
lastrow:=proposed->-1;
IF lastrow IS NOT NULL AND (lastrow->>'resource_id')::uuid=slot.resource_id AND (lastrow->>'stage_id')::uuid=slot.stage_id AND lastrow->>'day_part'=slot.part AND (lastrow->>'is_site_visit')::boolean=slot.is_site_visit AND NOT EXISTS(SELECT 1 FROM generate_series((lastrow->>'end_date')::date+1,slot.day-1,'1 day') d WHERE extract(isodow FROM d)<6 AND NOT EXISTS(SELECT 1 FROM holidays h WHERE h.data=d::date)) THEN proposed:=jsonb_set(proposed,ARRAY[(jsonb_array_length(proposed)-1)::text,'end_date'],to_jsonb(slot.day)); ELSE proposed:=proposed||jsonb_build_array(jsonb_build_object('resource_id',slot.resource_id,'stage_id',slot.stage_id,'start_date',slot.day,'end_date',slot.day,'day_part',slot.part,'hours_per_day',slot.hpd,'allocation_percentage',CASE WHEN slot.part='full' THEN 75 ELSE 37.5 END,'is_site_visit',slot.is_site_visit,'status','committed','source','week_plan','is_locked',false)); END IF;
END LOOP;
FOR a IN SELECT a.*,s.project_id,pr.status AS project_status FROM pm_allocations a JOIN pm_resources r ON r.id=a.resource_id AND r.active JOIN pm_stages s ON s.id=a.stage_id JOIN pm_projects pr ON pr.id=s.project_id WHERE a.planning_removed_at IS NULL AND a.start_date<=p.week_start+6 AND a.end_date>=p.week_start ORDER BY a.id LOOP
base:=to_jsonb(a)-'project_status';
IF a.is_locked OR a.source='imported_accelo' THEN skipped:=skipped||jsonb_build_array(base); IF EXISTS(SELECT 1 FROM jsonb_array_elements(resolved) e WHERE (e->>'resource_id')::uuid=a.resource_id AND (e->>'day')::date BETWEEN a.start_date AND a.end_date AND (a.day_part IS NULL OR a.day_part='full' OR a.day_part=e->>'part')) THEN overlap:=overlap||jsonb_build_array(base); END IF;
ELSIF a.project_status<>'active' THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','inactiveProject','resource_id',a.resource_id,'allocation_id',a.id,'project_id',a.project_id)); END IF;
END LOOP;
FOR v IN SELECT value FROM jsonb_array_elements(proposed) LOOP
SELECT a.id INTO found_id FROM pm_allocations a WHERE a.planning_removed_at IS NULL AND NOT coalesce(a.is_locked,false) AND a.source IS DISTINCT FROM 'imported_accelo' AND NOT(a.id=ANY(matched)) AND a.resource_id=(v->>'resource_id')::uuid AND a.stage_id=(v->>'stage_id')::uuid AND a.start_date=(v->>'start_date')::date AND a.end_date=(v->>'end_date')::date AND a.day_part IS NOT DISTINCT FROM v->>'day_part' AND a.hours_per_day=(v->>'hours_per_day')::numeric AND coalesce(a.is_site_visit,false)=(v->>'is_site_visit')::boolean AND a.status='committed' AND coalesce(a.allocation_percentage,(v->>'allocation_percentage')::numeric)=(v->>'allocation_percentage')::numeric ORDER BY a.id LIMIT 1;
IF found_id IS NOT NULL THEN matched:=array_append(matched,found_id); unchanged:=unchanged+1; ELSE ops:=ops||jsonb_build_array(jsonb_build_object('action','create','resource_id',v->>'resource_id','after',v)); END IF;
END LOOP;
FOR a IN SELECT a.* FROM pm_allocations a JOIN pm_resources r ON r.id=a.resource_id AND r.active WHERE a.planning_removed_at IS NULL AND a.start_date<=p.week_start+6 AND a.end_date>=p.week_start AND NOT coalesce(a.is_locked,false) AND a.source IS DISTINCT FROM 'imported_accelo' AND NOT(a.id=ANY(matched)) ORDER BY a.id LOOP
base:=to_jsonb(a);
IF a.start_date<p.week_start THEN ops:=ops||jsonb_build_array(jsonb_build_object('action','change','id',a.id,'resource_id',a.resource_id,'before',base,'after',base||jsonb_build_object('end_date',p.week_start-1))); IF a.end_date>p.week_start+6 THEN ops:=ops||jsonb_build_array(jsonb_build_object('action','split','resource_id',a.resource_id,'before',base,'after',(base-'id')||jsonb_build_object('start_date',p.week_start+7))); END IF;
ELSIF a.end_date>p.week_start+6 THEN ops:=ops||jsonb_build_array(jsonb_build_object('action','change','id',a.id,'resource_id',a.resource_id,'before',base,'after',base||jsonb_build_object('start_date',p.week_start+7)));
ELSE ops:=ops||jsonb_build_array(jsonb_build_object('action','remove','id',a.id,'resource_id',a.resource_id,'before',base)); END IF;
END LOOP;
RETURN jsonb_build_object('plan_id',p.id,'week_start',p.week_start,'token',md5(public.pm_week_revision(p.id)||_extensions::text),'operations',ops,'extensions',extensions,'offending_cells',issues,'skipped',skipped,'overlaps',overlap,'resolved_slots',resolved,'unchanged',unchanged,'past_week',p.week_start<date_trunc('week',current_date)::date,'resources',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM pm_resources WHERE active),'stages',(SELECT jsonb_agg(jsonb_build_object('id',id,'project_id',project_id,'name',name,'parent_stage_id',parent_stage_id,'sort_order',sort_order) ORDER BY id) FROM pm_stages),'projects',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id) FROM pm_projects));
END $$;
REVOKE ALL ON FUNCTION public.pm_preview_week_plan(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_preview_week_plan(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.pm_apply_week_plan(_plan_id uuid,_preview_token text DEFAULT NULL,_extensions jsonb DEFAULT '[]',_ack_overlap boolean DEFAULT false,_ack_baseline boolean DEFAULT false,_publication_id uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p pm_week_plans; preview jsonb; op jsonb; ext jsonb; row pm_allocations; person record; published_at timestamptz:=clock_timestamp(); result jsonb; prev pm_week_publications;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT(public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF NOT pg_try_advisory_xact_lock(170017,94) THEN RAISE EXCEPTION 'Publication in progress' USING ERRCODE='55P03'; END IF;
LOCK TABLE pm_week_plans,pm_week_plan_slots,pm_allocations,pm_stages,pm_tasks IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE pm_resources,pm_projects,vacation_requests,holidays,pm_stage_dependencies IN SHARE MODE;
SELECT * INTO prev FROM pm_week_publications WHERE id=_publication_id;
IF prev.id IS NOT NULL THEN IF prev.plan_id<>_plan_id OR prev.preview_token IS DISTINCT FROM _preview_token OR prev.approved_by<>auth.uid() THEN RAISE EXCEPTION 'Publication retry mismatch'; END IF; RETURN prev.summary; END IF;
SELECT * INTO p FROM pm_week_plans WHERE id=_plan_id FOR UPDATE;
preview:=public.pm_preview_week_plan(_plan_id,_extensions);
IF _preview_token IS NULL OR preview->>'token' IS DISTINCT FROM _preview_token THEN RAISE EXCEPTION 'Preview changed; refresh and confirm again' USING ERRCODE='40001'; END IF;
IF jsonb_array_length(preview->'offending_cells')>0 THEN RAISE EXCEPTION 'Unresolved planning blocks approval' USING DETAIL=(preview->'offending_cells')::text; END IF;
IF jsonb_array_length(preview->'overlaps')>0 AND NOT _ack_overlap THEN RAISE EXCEPTION 'Protected overlap acknowledgement required'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'extensions') e WHERE (e->>'baseline_locked')::boolean) AND NOT _ack_baseline THEN RAISE EXCEPTION 'Locked baseline acknowledgement required'; END IF;
PERFORM set_config('app.pm_week_plan_apply','1',true);
FOR ext IN SELECT value FROM jsonb_array_elements(preview->'extensions') LOOP UPDATE pm_stages SET start_date=least(start_date,(ext->>'start_date')::date),end_date=greatest(end_date,(ext->>'end_date')::date) WHERE id=(ext->>'stage_id')::uuid; END LOOP;
FOR op IN SELECT value FROM jsonb_array_elements(preview->'operations') LOOP
IF op->>'action'='remove' THEN UPDATE pm_allocations SET planning_removed_at=published_at WHERE id=(op->>'id')::uuid;
ELSIF op->>'action'='change' THEN UPDATE pm_allocations SET start_date=(op->'after'->>'start_date')::date,end_date=(op->'after'->>'end_date')::date WHERE id=(op->>'id')::uuid;
ELSE row:=jsonb_populate_record(NULL::pm_allocations,op->'after'); row.id:=gen_random_uuid(); row.created_at:=coalesce(row.created_at,published_at); row.updated_at:=coalesce(row.updated_at,published_at); INSERT INTO pm_allocations SELECT row.*; END IF;
END LOOP;
UPDATE pm_week_plan_slots w SET stage_id=(e->>'stage_id')::uuid FROM jsonb_array_elements(preview->'resolved_slots') e WHERE w.id=(e->>'id')::uuid AND w.stage_id IS DISTINCT FROM (e->>'stage_id')::uuid;
UPDATE pm_week_plans SET status='approved',approved_by=auth.uid(),approved_at=published_at WHERE id=p.id;
result:=(preview-'resolved_slots'-'token')||jsonb_build_object('publication_id',_publication_id,'approved_by',auth.uid(),'approved_at',published_at,'created',(SELECT count(*) FROM jsonb_array_elements(preview->'operations') e WHERE e->>'action' IN ('create','split')),'changed',(SELECT count(*) FROM jsonb_array_elements(preview->'operations') e WHERE e->>'action'='change'),'removed',(SELECT count(*) FROM jsonb_array_elements(preview->'operations') e WHERE e->>'action'='remove'));
INSERT INTO pm_week_publications(id,plan_id,week_start,approved_by,approved_at,preview_token,summary,published_slots) VALUES(_publication_id,p.id,p.week_start,auth.uid(),published_at,_preview_token,result,preview->'resolved_slots');
FOR person IN SELECT DISTINCT u.id FROM auth.users u JOIN collaborators c ON lower(c.email)=lower(u.email) WHERE c.archived_at IS NULL LOOP
IF public.notify_user(person.id,'week_plan_published','Plano da semana publicado',p.week_start::text||' – '||(p.week_start+4)::text,'/projects/week-plan?week='||p.week_start::text,'projects','week_plan',p.id,_dedupe_key=>'week_plan_published:'||p.week_start::text||':'||extract(epoch FROM published_at)::text) IS NULL THEN RAISE EXCEPTION 'Publication notification failed'; END IF;
END LOOP;
PERFORM set_config('app.pm_week_plan_apply','0',true); RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pm_apply_week_plan(uuid,text,jsonb,boolean,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_apply_week_plan(uuid,text,jsonb,boolean,boolean,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.pm_revise_week_plan(_plan_id uuid,_expected_updated_at timestamptz,_slots jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p pm_week_plans; item jsonb;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT(public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF NOT pg_try_advisory_xact_lock(170017,94) THEN RAISE EXCEPTION 'Publication in progress' USING ERRCODE='55P03'; END IF;
SELECT * INTO p FROM pm_week_plans WHERE id=_plan_id FOR UPDATE;
IF p.status<>'approved' OR p.updated_at IS DISTINCT FROM _expected_updated_at OR NOT EXISTS(SELECT 1 FROM pm_week_publications WHERE plan_id=p.id) THEN RAISE EXCEPTION 'Publication changed; reload'; END IF;
IF jsonb_typeof(_slots)<>'array' OR jsonb_array_length(_slots)>500 THEN RAISE EXCEPTION 'Invalid revision'; END IF;
PERFORM set_config('app.pm_week_plan_apply','1',true);
UPDATE pm_week_plans SET status='draft',notes='[]' WHERE id=p.id;
DELETE FROM pm_week_plan_slots WHERE plan_id=p.id;
FOR item IN SELECT value FROM jsonb_array_elements(_slots) LOOP INSERT INTO pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id,is_site_visit) VALUES(p.id,(item->>'resource_id')::uuid,(item->>'day')::date,item->>'part',(item->>'project_id')::uuid,(item->>'stage_id')::uuid,coalesce((item->>'is_site_visit')::boolean,false)); END LOOP;
PERFORM set_config('app.pm_week_plan_apply','0',true); RETURN public.pm_week_board(p.week_start);
END $$;
REVOKE ALL ON FUNCTION public.pm_revise_week_plan(uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_revise_week_plan(uuid,timestamptz,jsonb) TO authenticated;