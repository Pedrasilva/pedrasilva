ALTER TABLE public.pm_week_plans ADD COLUMN IF NOT EXISTS updated_by uuid, ADD COLUMN IF NOT EXISTS updated_by_name text, ADD COLUMN IF NOT EXISTS notes jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.pm_week_draft_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='pm_week_plans' THEN
  IF TG_OP='DELETE' THEN IF OLD.status<>'draft' THEN RAISE EXCEPTION 'Only drafts may be discarded'; END IF; RETURN OLD; END IF;
  IF NEW.status<>'draft' OR (TG_OP='UPDATE' AND (OLD.status<>'draft' OR NEW.week_start<>OLD.week_start)) THEN RAISE EXCEPTION 'Draft editing only'; END IF;
  NEW.updated_at:=clock_timestamp(); NEW.updated_by:=auth.uid();
  SELECT r.name INTO NEW.updated_by_name FROM public.pm_resources r WHERE r.collaborator_id=public.get_my_collaborator_id() LIMIT 1;
  IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid(); END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pm_week_plans p WHERE p.id=NEW.plan_id AND p.status='draft' AND NEW.day BETWEEN p.week_start AND p.week_start+4) THEN RAISE EXCEPTION 'Slot must belong to a draft weekday'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pm_resources r WHERE r.id=NEW.resource_id AND r.active=true) OR NOT EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id=NEW.project_id AND p.status='active') THEN RAISE EXCEPTION 'Inactive resource or project'; END IF;
 IF EXISTS (SELECT 1 FROM public.holidays h WHERE h.data=NEW.day) OR EXISTS (SELECT 1 FROM public.vacation_requests v JOIN public.pm_resources r ON r.collaborator_id=v.collaborator_id WHERE r.id=NEW.resource_id AND v.estado IN ('aprovada','aprovado') AND NEW.day BETWEEN v.data_inicio AND v.data_fim) THEN RAISE EXCEPTION 'Leave and holidays cannot be painted'; END IF;
 IF NEW.stage_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pm_stages s WHERE s.id=NEW.stage_id AND s.project_id=NEW.project_id AND NOT coalesce(s.is_milestone,false) AND coalesce(s.stage_kind,'')<>'retainer_monthly' AND s.archived_at IS NULL AND coalesce(s.status::text,'planned')<>'cancelled' AND NOT EXISTS (SELECT 1 FROM public.pm_stages c WHERE c.parent_stage_id=s.id AND c.archived_at IS NULL AND coalesce(c.status::text,'planned')<>'cancelled')) THEN RAISE EXCEPTION 'Stage is not allocatable for this project'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER pm_week_draft_plan_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pm_week_plans FOR EACH ROW EXECUTE FUNCTION public.pm_week_draft_guard();
CREATE TRIGGER pm_week_draft_slot_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pm_week_plan_slots FOR EACH ROW EXECUTE FUNCTION public.pm_week_draft_guard();
CREATE OR REPLACE FUNCTION public.pm_week_draft(_week_start date, _action text, _changes jsonb DEFAULT '[]'::jsonb, _expected_updated_at timestamptz DEFAULT NULL, _notes jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE p public.pm_week_plans; c jsonb; current_slot jsonb; after_slot jsonb; conflicts integer:=0; rid uuid; d date; half text; made boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _week_start IS NULL OR extract(isodow from _week_start)<>1 OR _action NOT IN ('create','save','discard') OR jsonb_typeof(_changes)<>'array' OR jsonb_array_length(_changes)>500 THEN RAISE EXCEPTION 'Invalid draft request'; END IF;
 IF _action='create' THEN
  INSERT INTO public.pm_week_plans(week_start) VALUES(_week_start) ON CONFLICT(week_start) DO NOTHING RETURNING * INTO p;
  made:=FOUND;
 END IF;
 SELECT * INTO p FROM public.pm_week_plans WHERE week_start=_week_start FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Draft no longer exists'; END IF;
 IF p.status<>'draft' THEN RAISE EXCEPTION 'Draft editing only'; END IF;
 IF _action='discard' THEN
  IF _expected_updated_at IS DISTINCT FROM p.updated_at THEN RAISE EXCEPTION 'Draft changed; reload before discarding'; END IF;
  DELETE FROM public.pm_week_plans WHERE id=p.id;
  RETURN jsonb_build_object('board',public.pm_week_board(_week_start),'conflicts',0);
 END IF;
 IF _action='save' OR made THEN
  FOR c IN SELECT value FROM jsonb_array_elements(_changes) LOOP
   rid:=(c->>'resource_id')::uuid; d:=(c->>'day')::date; half:=c->>'part';
   IF half NOT IN ('am','pm') OR d NOT BETWEEN p.week_start AND p.week_start+4 THEN RAISE EXCEPTION 'Invalid slot'; END IF;
   IF EXISTS(SELECT 1 FROM public.holidays WHERE data=d) OR EXISTS(SELECT 1 FROM public.vacation_requests v JOIN public.pm_resources r ON r.collaborator_id=v.collaborator_id WHERE r.id=rid AND v.estado IN ('aprovada','aprovado') AND d BETWEEN v.data_inicio AND v.data_fim) THEN RAISE EXCEPTION 'Leave and holidays cannot be painted'; END IF;
   SELECT jsonb_build_object('project_id',s.project_id,'stage_id',s.stage_id,'is_site_visit',s.is_site_visit) INTO current_slot FROM public.pm_week_plan_slots s WHERE s.plan_id=p.id AND s.resource_id=rid AND s.day=d AND s.part=half;
   IF _action='save' AND coalesce(current_slot,'null'::jsonb) IS DISTINCT FROM coalesce(c->'before','null'::jsonb) THEN conflicts:=conflicts+1; END IF;
   after_slot:=c->'after';
   IF after_slot IS NULL OR after_slot='null'::jsonb THEN
    DELETE FROM public.pm_week_plan_slots WHERE plan_id=p.id AND resource_id=rid AND day=d AND part=half;
   ELSE
    INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id,is_site_visit) VALUES(p.id,rid,d,half,(after_slot->>'project_id')::uuid,(after_slot->>'stage_id')::uuid,coalesce((after_slot->>'is_site_visit')::boolean,false)) ON CONFLICT(plan_id,resource_id,day,part) DO UPDATE SET project_id=excluded.project_id,stage_id=excluded.stage_id,is_site_visit=excluded.is_site_visit;
   END IF;
  END LOOP;
  UPDATE public.pm_week_plans SET notes=CASE WHEN _notes IS NULL THEN notes ELSE (SELECT coalesce(jsonb_agg(v),'[]'::jsonb) FROM (SELECT DISTINCT value AS v FROM jsonb_array_elements(notes || _notes)) n) END WHERE id=p.id RETURNING * INTO p;
 END IF;
 RETURN jsonb_build_object('board',public.pm_week_board(_week_start),'plan',to_jsonb(p),'conflicts',conflicts,'created',made);
END $fn$;
REVOKE ALL ON FUNCTION public.pm_week_draft(date,text,jsonb,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_week_draft(date,text,jsonb,timestamptz,jsonb) TO authenticated;
COMMENT ON FUNCTION public.pm_week_draft(date,text,jsonb,timestamptz,jsonb) IS 'Stage 2 atomic planner-only draft changes; row-lock merge, latest slot edit wins; never writes Gantt allocations or stage dates.';

CREATE OR REPLACE FUNCTION public.pm_week_board(_week_start date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE result jsonb; planner boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _week_start IS NULL OR extract(isodow from _week_start)<>1 THEN RAISE EXCEPTION 'Week must start on Monday'; END IF;
 planner := public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all');
 WITH resources AS (SELECT r.id,r.name,r.color,r.collaborator_id,r.weekly_capacity FROM public.pm_resources r WHERE r.active=true),
 projects AS (SELECT p.id,p.name,p.client,p.color FROM public.pm_projects p WHERE p.status='active'),
 stages AS (SELECT s.id,s.project_id,s.name,s.start_date,s.end_date,s.sort_order,s.parent_stage_id,s.stage_kind,s.is_milestone,s.is_self FROM public.pm_stages s JOIN projects p ON p.id=s.project_id WHERE NOT coalesce(s.is_milestone,false) AND coalesce(s.stage_kind,'')<>'retainer_monthly' AND s.archived_at IS NULL AND coalesce(s.status::text,'planned')<>'cancelled' AND NOT EXISTS(SELECT 1 FROM public.pm_stages child WHERE child.parent_stage_id=s.id AND child.archived_at IS NULL AND coalesce(child.status::text,'planned')<>'cancelled')),
 allocations AS (SELECT a.id,a.resource_id,a.stage_id,s.project_id,a.start_date,a.end_date,a.hours_per_day,a.day_part,a.is_site_visit,a.status,a.is_locked,a.source FROM public.pm_allocations a JOIN stages s ON s.id=a.stage_id JOIN resources r ON r.id=a.resource_id WHERE a.start_date<=_week_start+6 AND a.end_date>=_week_start),
 days AS (SELECT _week_start+i AS day FROM generate_series(0,4) i),
 leave_days AS (SELECT DISTINCT r.id AS resource_id,d.day,'leave'::text AS kind,NULL::text AS name FROM resources r JOIN public.vacation_requests v ON v.collaborator_id=r.collaborator_id JOIN days d ON d.day BETWEEN v.data_inicio AND v.data_fim WHERE v.estado IN ('aprovada','aprovado') UNION ALL SELECT r.id,d.day,'holiday',h.nome FROM resources r CROSS JOIN days d JOIN public.holidays h ON h.data=d.day)
 SELECT jsonb_build_object('resources',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM resources r),'[]'::jsonb),'projects',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name) FROM projects p),'[]'::jsonb),'stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sort_order) FROM stages s),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM allocations a),'[]'::jsonb),'leave',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM leave_days l),'[]'::jsonb),'plan',(SELECT jsonb_build_object('id',p.id,'status',p.status,'approved_by',p.approved_by,'approved_at',p.approved_at,'updated_at',p.updated_at,'updated_by_name',p.updated_by_name,'notes',p.notes) FROM public.pm_week_plans p WHERE p.week_start=_week_start AND (planner OR p.status='approved')),'draft_slots',CASE WHEN planner THEN coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.pm_week_plan_slots s JOIN public.pm_week_plans p ON p.id=s.plan_id WHERE p.week_start=_week_start),'[]'::jsonb) ELSE '[]'::jsonb END,'my_collaborator_id',public.get_my_collaborator_id()) INTO result;
 RETURN result;
END $fn$;
