CREATE TABLE public.quote_relative_schedules (quote_id uuid PRIMARY KEY REFERENCES public.fee_proposals(id) ON DELETE CASCADE, original_dates jsonb NOT NULL, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.quote_relative_schedules TO authenticated; GRANT ALL ON public.quote_relative_schedules TO service_role;
ALTER TABLE public.quote_relative_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_relative_read ON public.quote_relative_schedules FOR SELECT TO authenticated USING (public.is_psa_staff());
CREATE POLICY quote_relative_insert ON public.quote_relative_schedules FOR INSERT TO authenticated WITH CHECK (public.is_psa_staff() AND public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.pm_gantt_state(_mode text,_scope uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE result jsonb;
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF _mode='quote' THEN
IF NOT EXISTS(SELECT 1 FROM fee_proposals WHERE id=_scope) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
result:=jsonb_build_object('stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM quote_stages s WHERE quote_id=_scope),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM quote_allocations a WHERE quote_id=_scope),'[]'::jsonb),'dependencies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'predecessor_id',predecessor_stage_id,'successor_id',successor_stage_id,'type',type,'lag_days',lag_days) ORDER BY id) FROM quote_stage_dependencies WHERE quote_id=_scope),'[]'::jsonb),'relative',EXISTS(SELECT 1 FROM quote_relative_schedules WHERE quote_id=_scope),'holidays','[]'::jsonb,'quote',(SELECT to_jsonb(q) FROM fee_proposals q WHERE id=_scope));
ELSIF _mode='project' THEN
IF NOT EXISTS(SELECT 1 FROM pm_projects WHERE id=_scope) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
result:=jsonb_build_object('stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM pm_stages s WHERE project_id=_scope),'[]'::jsonb),'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM pm_allocations a JOIN pm_stages s ON s.id=a.stage_id WHERE s.project_id=_scope AND a.planning_removed_at IS NULL),'[]'::jsonb),'dependencies',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM pm_stage_dependencies d WHERE predecessor_id IN (SELECT id FROM pm_stages WHERE project_id=_scope) OR successor_id IN (SELECT id FROM pm_stages WHERE project_id=_scope)),'[]'::jsonb),'relative',false,'holidays',coalesce((SELECT jsonb_agg(data ORDER BY data) FROM holidays),'[]'::jsonb));
ELSE RAISE EXCEPTION 'Invalid mode'; END IF;
RETURN result||jsonb_build_object('revision',md5(result::text));
END $fn$;
REVOKE ALL ON FUNCTION public.pm_gantt_state(text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pm_gantt_state(text,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pm_gantt_save(_mode text,_scope uuid,_revision text,_patch jsonb,_initialize boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE before_state jsonb; after_state jsonb; r jsonb; n integer; ids uuid[];
BEGIN
IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF NOT pg_try_advisory_xact_lock(hashtextextended('gantt:'||_mode||':'||_scope::text,0)) THEN RAISE EXCEPTION 'gantt.schedule.busy'; END IF;
IF _mode='project' THEN
LOCK TABLE pm_stages,pm_allocations,pm_stage_dependencies IN SHARE ROW EXCLUSIVE MODE;
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
ELSE
LOCK TABLE quote_stages,quote_allocations,quote_stage_dependencies IN SHARE ROW EXCLUSIVE MODE;
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
IF EXISTS(SELECT 1 FROM fee_proposals WHERE id=_scope AND (is_locked OR pm_project_id IS NOT NULL)) THEN RAISE EXCEPTION 'Quote is locked'; END IF;
END IF;
before_state:=public.pm_gantt_state(_mode,_scope);
IF before_state->>'revision' IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
IF _initialize AND _mode='quote' THEN INSERT INTO quote_relative_schedules(quote_id,original_dates) VALUES(_scope,before_state) ON CONFLICT(quote_id) DO NOTHING; END IF;
FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_patch->'stages','[]'::jsonb)) LOOP
IF (r->>'end_date')::date<(r->>'start_date')::date THEN RAISE EXCEPTION 'gantt.schedule.invalidRange'; END IF;
IF _mode='quote' THEN UPDATE quote_stages SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date,manual_override=true WHERE id=(r->>'id')::uuid AND quote_id=_scope;
ELSE
IF EXISTS(SELECT 1 FROM pm_stages WHERE id=(r->>'id')::uuid AND is_locked) THEN RAISE EXCEPTION 'gantt.schedule.locked'; END IF;
UPDATE pm_stages SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND project_id=_scope;
END IF; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
END LOOP;
FOR r IN SELECT value FROM jsonb_array_elements(coalesce(_patch->'allocations','[]'::jsonb)) LOOP
IF _mode='quote' THEN UPDATE quote_allocations SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND quote_id=_scope;
ELSE
IF EXISTS(SELECT 1 FROM pm_allocations WHERE id=(r->>'id')::uuid AND (is_locked OR source='imported_accelo')) THEN RAISE EXCEPTION 'gantt.schedule.lockedAllocation'; END IF;
UPDATE pm_allocations SET start_date=(r->>'start_date')::date,end_date=(r->>'end_date')::date WHERE id=(r->>'id')::uuid AND planning_removed_at IS NULL AND stage_id IN(SELECT id FROM pm_stages WHERE project_id=_scope);
END IF; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'gantt.schedule.stale'; END IF;
END LOOP;
IF _patch ? 'dependencies' THEN
SELECT coalesce(array_agg((value->>'id')::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements(_patch->'dependencies');
IF _mode='quote' THEN DELETE FROM quote_stage_dependencies WHERE quote_id=_scope AND NOT(id=ANY(ids)); ELSE DELETE FROM pm_stage_dependencies WHERE predecessor_id IN(SELECT id FROM pm_stages WHERE project_id=_scope) AND NOT(id=ANY(ids)); END IF;
FOR r IN SELECT value FROM jsonb_array_elements(_patch->'dependencies') LOOP
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=r->>'predecessor_id') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_state->'stages') s WHERE s->>'id'=r->>'successor_id') THEN RAISE EXCEPTION 'gantt.schedule.invalidLink'; END IF;
IF _mode='quote' THEN
INSERT INTO quote_stage_dependencies(id,quote_id,predecessor_stage_id,successor_stage_id,type,lag_days) VALUES((r->>'id')::uuid,_scope,(r->>'predecessor_id')::uuid,(r->>'successor_id')::uuid,(r->>'type')::quote_dep_type,(r->>'lag_days')::integer) ON CONFLICT(id) DO UPDATE SET type=excluded.type,lag_days=excluded.lag_days,predecessor_stage_id=excluded.predecessor_stage_id,successor_stage_id=excluded.successor_stage_id WHERE quote_stage_dependencies.quote_id=_scope;
ELSE
INSERT INTO pm_stage_dependencies(id,predecessor_id,successor_id,type,lag_days) VALUES((r->>'id')::uuid,(r->>'predecessor_id')::uuid,(r->>'successor_id')::uuid,(r->>'type')::pm_dep_type,(r->>'lag_days')::integer) ON CONFLICT(id) DO UPDATE SET type=excluded.type,lag_days=excluded.lag_days,predecessor_id=excluded.predecessor_id,successor_id=excluded.successor_id WHERE pm_stage_dependencies.predecessor_id IN(SELECT id FROM pm_stages WHERE project_id=_scope);
END IF;
END LOOP;
END IF;
after_state:=public.pm_gantt_state(_mode,_scope);
RETURN jsonb_build_object('before',before_state,'after',after_state);
END $fn$;
REVOKE ALL ON FUNCTION public.pm_gantt_save(text,uuid,text,jsonb,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pm_gantt_save(text,uuid,text,jsonb,boolean) TO authenticated,service_role;
COMMENT ON TABLE public.quote_relative_schedules IS 'Explicit relative planning initialization, preserving original absolute quote dates; never initializes on page load.';