ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.pm_suppliers(id);
ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS supplier_placeholder text;
ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS budget_mode text DEFAULT 'calculated';
ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS stage_billing_timing text DEFAULT 'end';
ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS is_optional boolean DEFAULT false;
CREATE OR REPLACE FUNCTION public.pm_can_edit_gantt(_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.is_psa_staff() AND public.can_view_project_area(_project,'financials'); $$;
REVOKE ALL ON FUNCTION public.pm_can_edit_gantt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_can_edit_gantt(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pm_gantt_write_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_project uuid; new_project uuid; other_project uuid;
BEGIN
 IF auth.uid() IS NULL THEN
  IF session_user IN ('postgres','supabase_admin') OR coalesce(auth.role(),'')='service_role' THEN RETURN coalesce(NEW,OLD); END IF;
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='pm_stages' THEN
  IF TG_OP<>'INSERT' THEN old_project:=OLD.project_id; END IF;
  IF TG_OP<>'DELETE' THEN new_project:=NEW.project_id; END IF;
 ELSIF TG_TABLE_NAME='pm_allocations' THEN
  IF TG_OP='INSERT' AND NEW.source='timesheet_link' AND NEW.planning_removed_at IS NOT NULL AND NEW.hours_per_day=0 AND NEW.resource_id=public.pm_get_my_resource_id() THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN SELECT project_id INTO old_project FROM pm_stages WHERE id=OLD.stage_id; END IF;
  IF TG_OP<>'DELETE' THEN SELECT project_id INTO new_project FROM pm_stages WHERE id=NEW.stage_id; END IF;
  IF coalesce(current_setting('app.pm_week_plan_apply',true),'')='1' THEN RETURN coalesce(NEW,OLD); END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN
   SELECT project_id INTO old_project FROM pm_stages WHERE id=OLD.predecessor_id;
   SELECT project_id INTO other_project FROM pm_stages WHERE id=OLD.successor_id;
   IF NOT coalesce(public.pm_can_edit_gantt(other_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
   SELECT project_id INTO new_project FROM pm_stages WHERE id=NEW.predecessor_id;
   SELECT project_id INTO other_project FROM pm_stages WHERE id=NEW.successor_id;
   IF NOT coalesce(public.pm_can_edit_gantt(other_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'INSERT' AND NOT coalesce(public.pm_can_edit_gantt(old_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'DELETE' AND NOT coalesce(public.pm_can_edit_gantt(new_project),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.pm_gantt_write_scope_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_pm_gantt_write_scope BEFORE INSERT OR UPDATE OR DELETE ON public.pm_stages FOR EACH ROW EXECUTE FUNCTION public.pm_gantt_write_scope_guard();
CREATE TRIGGER zz_pm_gantt_write_scope BEFORE INSERT OR UPDATE OR DELETE ON public.pm_allocations FOR EACH ROW EXECUTE FUNCTION public.pm_gantt_write_scope_guard();
CREATE TRIGGER zz_pm_gantt_write_scope BEFORE INSERT OR UPDATE OR DELETE ON public.pm_stage_dependencies FOR EACH ROW EXECUTE FUNCTION public.pm_gantt_write_scope_guard();
CREATE POLICY "Financial Gantt insert" ON public.pm_stages FOR INSERT TO authenticated WITH CHECK(public.pm_can_edit_gantt(project_id));
CREATE POLICY "Financial Gantt update" ON public.pm_stages FOR UPDATE TO authenticated USING(public.pm_can_edit_gantt(project_id)) WITH CHECK(public.pm_can_edit_gantt(project_id));
CREATE POLICY "Financial Gantt delete" ON public.pm_stages FOR DELETE TO authenticated USING(public.pm_can_edit_gantt(project_id));
CREATE POLICY "Financial Gantt insert" ON public.pm_allocations FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=stage_id AND public.pm_can_edit_gantt(s.project_id)));
CREATE POLICY "Financial Gantt update" ON public.pm_allocations FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=stage_id AND public.pm_can_edit_gantt(s.project_id))) WITH CHECK(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=stage_id AND public.pm_can_edit_gantt(s.project_id)));
CREATE POLICY "Financial Gantt delete" ON public.pm_allocations FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=stage_id AND public.pm_can_edit_gantt(s.project_id)));
CREATE POLICY "Financial Gantt insert" ON public.pm_stage_dependencies FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=predecessor_id AND public.pm_can_edit_gantt(s.project_id)));
CREATE POLICY "Financial Gantt update" ON public.pm_stage_dependencies FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=predecessor_id AND public.pm_can_edit_gantt(s.project_id))) WITH CHECK(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=predecessor_id AND public.pm_can_edit_gantt(s.project_id)));
CREATE POLICY "Financial Gantt delete" ON public.pm_stage_dependencies FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM pm_stages s WHERE s.id=predecessor_id AND public.pm_can_edit_gantt(s.project_id)));
CREATE OR REPLACE FUNCTION public.pm_stage_role_at_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb;
BEGIN
 IF NEW.source_quote_stage_id IS NOT NULL THEN
  SELECT evidence INTO item FROM pm_projects p JOIN fee_proposals q ON q.id=p.quote_id JOIN psa_proposal_snapshots snap ON snap.id=q.accepted_snapshot_id CROSS JOIN LATERAL jsonb_array_elements(coalesce(snap.snapshot#>'{quote_data,raw,quote_stages}','[]'::jsonb)) evidence WHERE p.id=NEW.project_id AND evidence->>'id'=NEW.source_quote_stage_id::text;
  IF item->>'stage_role' IN ('architecture','client','supplier_group','supplier_phase') THEN NEW.stage_role:=coalesce(NEW.stage_role,item->>'stage_role'); END IF;
  NEW.supplier_id:=coalesce(NEW.supplier_id,nullif(item->>'supplier_id','')::uuid);
  NEW.supplier_placeholder:=coalesce(NEW.supplier_placeholder,item->>'supplier_placeholder');
  NEW.budget_mode:=coalesce(item->>'budget_mode',NEW.budget_mode);
  NEW.stage_billing_timing:=coalesce(item->>'stage_billing_timing',NEW.stage_billing_timing);
  NEW.is_optional:=coalesce((item->>'is_optional')::boolean,NEW.is_optional);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.pm_gantt_save(_mode text, _scope uuid, _revision text, _patch jsonb, _initialize boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE before_state jsonb; after_state jsonb; r jsonb; n integer; ids uuid[]; dep_changed boolean; stages_changed boolean; allocs_changed boolean;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _mode='quote' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
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
IF _mode='project' AND NOT public.pm_can_edit_gantt(_scope) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
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
IF EXISTS(SELECT 1 FROM jsonb_array_elements(_patch->'dependencies') d WHERE d->>'type' NOT IN('FS','SS','FF','SF') OR (d->>'predecessor_id')::uuid=(d->>'successor_id')::uuid OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=d->>'predecessor_id') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=d->>'successor_id')) THEN RAISE EXCEPTION 'gantt.schedule.invalidLink'; END IF;
WITH RECURSIVE links AS(SELECT d->>'predecessor_id' p,d->>'successor_id' s FROM jsonb_array_elements(_patch->'dependencies') d), walk AS(SELECT p,s,ARRAY[p,s] path,p=s cycle FROM links UNION ALL SELECT w.p,l.s,w.path||l.s,l.s=ANY(w.path) FROM walk w JOIN links l ON l.p=w.s WHERE NOT w.cycle) SELECT count(*) INTO n FROM walk WHERE cycle; IF n>0 THEN RAISE EXCEPTION 'gantt.schedule.circular'; END IF;
IF _mode='quote' THEN
DELETE FROM quote_stage_dependencies WHERE quote_id=_scope;
INSERT INTO quote_stage_dependencies(id,quote_id,predecessor_stage_id,successor_stage_id,type,lag_days) SELECT coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()),_scope,(d->>'predecessor_id')::uuid,(d->>'successor_id')::uuid,(d->>'type')::quote_dep_type,coalesce((d->>'lag_days')::integer,0) FROM jsonb_array_elements(_patch->'dependencies') d;
ELSE
DELETE FROM pm_stage_dependencies WHERE predecessor_id IN(SELECT id FROM pm_stages WHERE project_id=_scope);
INSERT INTO pm_stage_dependencies(id,predecessor_id,successor_id,type,lag_days) SELECT coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()),(d->>'predecessor_id')::uuid,(d->>'successor_id')::uuid,d->>'type',coalesce((d->>'lag_days')::integer,0) FROM jsonb_array_elements(_patch->'dependencies') d; END IF; END IF;
after_state:=public.pm_gantt_state(_mode,_scope);
IF _mode='project' THEN UPDATE pm_projects SET start_date=(SELECT min(start_date) FROM pm_stages WHERE project_id=_scope AND stage_kind<>'retainer_month') WHERE id=_scope; END IF;
RETURN jsonb_build_object('before',before_state,'after',after_state);
END $function$;