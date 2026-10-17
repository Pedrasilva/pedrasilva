REVOKE ALL ON public.pm_week_publications FROM authenticated;
GRANT SELECT ON public.pm_week_publications TO authenticated;
ALTER POLICY week_publications_staff ON public.pm_week_publications USING(public.is_psa_staff() AND (public.has_role(auth.uid(),'admin') OR public.has_module_permission(auth.uid(),'projects.edit_planning','all')));
DO $migration$
DECLARE definition text;
BEGIN
SELECT pg_get_functiondef('public.pm_preview_week_plan(uuid,jsonb)'::regprocedure) INTO definition;
-- Merge only immediately consecutive working days, never across holidays or empty weekdays.
definition:=replace(definition,'AND NOT EXISTS(SELECT 1 FROM generate_series','AND slot.day-(lastrow->>''end_date'')::date IN (1,3) AND NOT EXISTS(SELECT 1 FROM generate_series');
EXECUTE definition;
SELECT pg_get_functiondef('public.pm_verify_week_publication()'::regprocedure) INTO definition;
definition:=replace(definition,'RAISE EXCEPTION ''verification_rollback'';', $checks$
-- Approved plan audit is immutable outside apply workflow.
BEGIN UPDATE pm_week_plans SET notes='[]' WHERE id=planid; RAISE EXCEPTION 'Direct approved edit accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Approved plans are immutable' THEN RAISE; END IF; END; checks:=checks+1;
PERFORM pm_revise_week_plan(planid,(SELECT updated_at FROM pm_week_plans WHERE id=planid),'[]');
-- Nullable stage must resolve only from an explicit valid extension.
UPDATE pm_stages SET end_date='2099-01-11',baseline_locked_at=clock_timestamp() WHERE id=sid;
UPDATE pm_week_plans SET notes=jsonb_build_array(jsonb_build_object('project_id',pid,'stage_id',sid,'resource_id',rid,'until','2099-01-12')) WHERE id=planid;
INSERT INTO pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id,is_site_visit) VALUES(planid,rid,'2099-01-12','pm',pid,NULL,false);
preview:=pm_preview_week_plan(planid);
IF jsonb_array_length(preview->'offending_cells')<>1 THEN RAISE EXCEPTION 'Unresolved stage did not block'; END IF;
preview:=pm_preview_week_plan(planid,(SELECT notes FROM pm_week_plans WHERE id=planid));
IF jsonb_array_length(preview->'offending_cells')<>0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'operations') e WHERE e->>'action'='create' AND e->'after'->>'day_part'='pm' AND (e->'after'->>'hours_per_day')::numeric=3) THEN RAISE EXCEPTION 'Half-day explicit extension resolution failed'; END IF;
BEGIN PERFORM pm_apply_week_plan(planid,preview->>'token',(SELECT notes FROM pm_week_plans WHERE id=planid),false,false,gen_random_uuid()); RAISE EXCEPTION 'Baseline accepted without acknowledgement'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Locked baseline acknowledgement required' THEN RAISE; END IF; END;
result:=pm_apply_week_plan(planid,preview->>'token',(SELECT notes FROM pm_week_plans WHERE id=planid),false,true,gen_random_uuid());
IF (SELECT end_date FROM pm_stages WHERE id=sid)<>'2099-01-12' OR EXISTS(SELECT 1 FROM pm_week_plan_slots WHERE plan_id=planid AND stage_id IS NULL) THEN RAISE EXCEPTION 'Extension application failed'; END IF; checks:=checks+1;
-- Non-planner identity cannot directly approve or preview.
PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-999999999999","role":"authenticated"}',true);
PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-a000-999999999999',true);
BEGIN PERFORM pm_apply_week_plan(planid,NULL); RAISE EXCEPTION 'Unauthorized approval accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN PERFORM pm_preview_week_plan(planid); RAISE EXCEPTION 'Unauthorized preview accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; checks:=checks+1;
RAISE EXCEPTION 'verification_rollback';
$checks$);
EXECUTE definition;
END $migration$;