REVOKE ALL ON public.pm_gantt_value_history FROM anon,authenticated;
GRANT SELECT ON public.pm_gantt_value_history TO authenticated;
REVOKE TRUNCATE ON public.pm_gantt_value_history FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.pm_gantt_payment_amount_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.amount_type,NEW.amount_value) IS DISTINCT FROM (OLD.amount_type,OLD.amount_value) AND (OLD.dates_frozen_at IS NOT NULL OR OLD.billing_status::text IN ('issued','paid','cancelled') OR EXISTS(SELECT 1 FROM financial_document_lines l JOIN financial_documents d ON d.id=l.document_id WHERE l.payment_schedule_item_id=OLD.id AND d.status::text NOT IN ('draft','cancelled'))) THEN RAISE EXCEPTION 'Issued invoices and confirmed payments are protected'; END IF;
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
ELSE
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