DO $migration$
DECLARE definition text;
BEGIN
SELECT pg_get_functiondef('public.pm_verify_week_publication()'::regprocedure) INTO definition;
definition:=replace(definition,'-- Non-planner identity cannot directly approve or preview.', $checks$
-- Inactive projects cannot be silently removed, including bookings invisible on active-project board.
PERFORM pm_revise_week_plan(planid,(SELECT updated_at FROM pm_week_plans WHERE id=planid),'[]');
UPDATE pm_projects SET status='paused' WHERE id=pid;
preview:=pm_preview_week_plan(planid);
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'offending_cells') e WHERE e->>'code'='inactiveProject') THEN RAISE EXCEPTION 'Inactive project did not block'; END IF; checks:=checks+1;
UPDATE pm_projects SET status='active' WHERE id=pid;
-- Holiday changes after save invalidate slots and preview confirmation.
INSERT INTO pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id,is_site_visit) VALUES(planid,rid,'2099-01-12','pm',pid,sid,false);
preview:=pm_preview_week_plan(planid);
INSERT INTO holidays(data,nome) VALUES('2099-01-12','ROLLBACK holiday fixture');
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pm_preview_week_plan(planid)->'offending_cells') e WHERE e->>'code'='invalidSlot') THEN RAISE EXCEPTION 'Holiday did not block'; END IF;
BEGIN PERFORM pm_apply_week_plan(planid,preview->>'token'); RAISE EXCEPTION 'Holiday change did not stale preview'; EXCEPTION WHEN serialization_failure THEN NULL; END; checks:=checks+1;
-- Non-planner identity cannot directly approve or preview.
$checks$);
EXECUTE definition;
END $migration$;