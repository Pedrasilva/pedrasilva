-- Copy-only fixtures: every change rolls back; never log on a real stage.
BEGIN;
DO $test$
DECLARE actor uuid; rid uuid; admin_id uuid; pid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); parent_id uuid:=gen_random_uuid(); month_id uuid:=gen_random_uuid(); a1 uuid; a2 uuid; task1 uuid; task2 uuid; got uuid; entry_id uuid; before_alloc jsonb; before_entry jsonb; preview jsonb; snapshot_id uuid; result jsonb; checks int:=0; original_project pm_projects; original_stage pm_stages; original_entry pm_time_entries; locked_week uuid:=gen_random_uuid();
BEGIN
 SELECT user_id INTO admin_id FROM user_roles WHERE role='admin' LIMIT 1;
 FOR actor,rid IN SELECT u.id,r.id FROM auth.users u JOIN collaborators c ON lower(c.email)=lower(u.email) JOIN pm_resources r ON r.collaborator_id=c.id WHERE c.archived_at IS NULL LOOP
  IF NOT has_role(actor,'admin') AND NOT has_module_permission(actor,'projects.edit_planning','all') AND NOT has_module_permission(actor,'projects.edit_planning','assigned') AND NOT pm_can_approve_hours(actor) THEN EXIT; END IF; actor:=NULL;
 END LOOP;
 IF actor IS NULL THEN RAISE EXCEPTION 'No staff fixture without planning/approval rights'; END IF;
 SELECT * INTO STRICT original_project FROM pm_projects WHERE status='active' ORDER BY id LIMIT 1;
 SELECT * INTO STRICT original_stage FROM pm_stages WHERE project_id=original_project.id AND parent_stage_id IS NULL AND is_self IS DISTINCT FROM false ORDER BY id LIMIT 1;
 SELECT * INTO STRICT original_entry FROM pm_time_entries WHERE entry_type='project' ORDER BY id LIMIT 1;
 INSERT INTO pm_projects SELECT * FROM jsonb_populate_record(NULL::pm_projects,to_jsonb(original_project)||jsonb_build_object('id',pid,'name','CUT-OFF TEST COPY','quote_id',NULL,'source_contract_id',NULL,'bootstrap_run_id',NULL,'external_id',NULL,'opportunity_id',NULL));
 INSERT INTO pm_stages SELECT * FROM jsonb_populate_record(NULL::pm_stages,to_jsonb(original_stage)||jsonb_build_object('id',sid,'project_id',pid,'parent_stage_id',NULL,'name','Active copy','status','active','stage_kind','regular','start_date','2026-10-01','end_date','2026-11-30','is_self',true,'is_locked',false,'archived_at',NULL,'external_id',NULL,'source_quote_stage_id',NULL,'source_contract_id',NULL,'bootstrap_run_id',NULL));
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 got:=pm_ensure_timesheet_task(rid,sid);
 IF NOT EXISTS(SELECT 1 FROM pm_tasks t JOIN pm_allocations a ON a.id=t.allocation_id WHERE t.id=got AND a.hours_per_day=0 AND a.planning_removed_at IS NOT NULL AND a.source='timesheet_link') THEN RAISE EXCEPTION 'Missing retired zero-hour technical link'; END IF; checks:=checks+1;
 task1:=got;
 IF pm_ensure_timesheet_task(rid,sid)<>got OR (SELECT count(*) FROM pm_allocations WHERE stage_id=sid)<>1 THEN RAISE EXCEPTION 'Repeated preparation duplicated links'; END IF; checks:=checks+1;
 entry_id:=gen_random_uuid();
 INSERT INTO pm_time_entries(id,task_id,user_id,entry_date,hours,notes,entry_type,source) VALUES(entry_id,got,actor,'2026-10-19',1.25,'copy-only cutoff activity','project','timesheet');
 IF NOT EXISTS(SELECT 1 FROM pm_time_entries WHERE id=entry_id AND hours=1.25 AND notes='copy-only cutoff activity' AND approval_status='pending') THEN RAISE EXCEPTION 'Staff 19 October write/read failed'; END IF; checks:=checks+1;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(pm_week_board('2026-10-19')->'allocations') a WHERE a->>'stage_id'=sid::text) THEN RAISE EXCEPTION 'Technical link leaked into weekly planning'; END IF; checks:=checks+1;
 BEGIN PERFORM pm_ensure_timesheet_task(gen_random_uuid(),sid); RAISE EXCEPTION 'Cross-person preparation accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; checks:=checks+1;
 RESET ROLE;
 SELECT to_jsonb(e) INTO before_entry FROM pm_time_entries e WHERE id=entry_id;
 SELECT allocation_id INTO a1 FROM pm_tasks WHERE id=task1;
 -- A ended allocation, plus multiple other allocations, must reuse task1 unchanged.
 UPDATE pm_allocations SET planning_removed_at=NULL,end_date='2026-10-16',is_locked=true WHERE id=a1;
 INSERT INTO pm_allocations(stage_id,resource_id,start_date,end_date,hours_per_day) VALUES(sid,rid,'2026-10-19','2026-10-23',3) RETURNING id INTO a2;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) INTO before_alloc FROM pm_allocations a WHERE stage_id=sid;
 SET LOCAL ROLE authenticated;
 IF pm_ensure_timesheet_task(rid,sid)<>task1 THEN RAISE EXCEPTION 'Multiple allocations did not reuse deterministic task'; END IF; checks:=checks+1;
 INSERT INTO pm_time_entries(task_id,user_id,entry_date,hours,notes,entry_type) VALUES(task1,actor,'2026-10-19',0.75,'ended allocation copy activity','project');
 RESET ROLE;
 IF (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM pm_allocations a WHERE stage_id=sid) IS DISTINCT FROM before_alloc OR (SELECT to_jsonb(e) FROM pm_time_entries e WHERE id=entry_id) IS DISTINCT FROM before_entry THEN RAISE EXCEPTION 'Existing allocation/lock/activity/snapshot mutated'; END IF; checks:=checks+1;
 UPDATE pm_allocations SET planning_removed_at=now() WHERE id=a1;
 SET LOCAL ROLE authenticated;
 IF pm_ensure_timesheet_task(rid,sid)<>task1 THEN RAISE EXCEPTION 'Retired task not reused'; END IF; checks:=checks+1;
 RESET ROLE;
 -- Monthly child copy, including planned child status (existing monthly exception).
 INSERT INTO pm_stages(id,project_id,name,start_date,end_date,status,stage_kind) VALUES(parent_id,pid,'Monthly copy','2026-10-01','2026-11-30','active','retainer_monthly');
 INSERT INTO pm_stages(id,project_id,parent_stage_id,name,start_date,end_date,status,stage_kind) VALUES(month_id,pid,parent_id,'October copy','2026-10-01','2026-10-31','planned','retainer_month');
 SET LOCAL ROLE authenticated;
 task2:=pm_ensure_timesheet_task(rid,month_id);
 INSERT INTO pm_time_entries(task_id,user_id,entry_date,hours,notes,entry_type) VALUES(task2,actor,'2026-10-19',0.5,'monthly copy activity','project'); checks:=checks+1;
 BEGIN INSERT INTO pm_time_entries(task_id,user_id,entry_date,hours,entry_type) VALUES(task2,actor,'2026-11-02',1,'project'); RAISE EXCEPTION 'Outside monthly dates accepted'; EXCEPTION WHEN check_violation THEN NULL; END; checks:=checks+1;
 BEGIN PERFORM pm_ensure_timesheet_task(rid,parent_id); RAISE EXCEPTION 'Parent stage accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END; checks:=checks+1;
 RESET ROLE;
 UPDATE pm_stages SET status='done' WHERE id=sid;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM pm_ensure_timesheet_task(rid,sid); RAISE EXCEPTION 'Closed stage accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END; checks:=checks+1;
 RESET ROLE;
 UPDATE pm_stages SET status='active' WHERE id=sid;
 -- Submitted/approved weeks must still block staff. Fixture week only, no real week changed.
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 INSERT INTO pm_timesheet_weeks(id,user_id,week_start,week_end,status) VALUES(locked_week,actor,'2098-06-09','2098-06-15','approved');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN INSERT INTO pm_time_entries(task_id,user_id,entry_date,hours,entry_type) VALUES(task1,actor,'2098-06-09',1,'project'); RAISE EXCEPTION 'Locked week accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'This week has been approved%' THEN RAISE; END IF; END; checks:=checks+1;
 RESET ROLE;
 -- Cutoff/undo only on the copied project; future a2 without hours retires.
 UPDATE pm_allocations SET planning_removed_at=NULL,is_locked=false,end_date='2026-10-31' WHERE id=a1;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) INTO before_alloc FROM pm_allocations a WHERE stage_id IN(sid,month_id);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 preview:=pm_planning_cutoff_preview('2026-10-19','2026-10-16',ARRAY[pid]);
 IF (preview->'projects'->0->>'trim')::int<>1 OR (preview->'projects'->0->>'retire')::int<>1 OR (preview->'projects'->0->>'removed_hours')::numeric<>15 THEN RAISE EXCEPTION 'Copy cutoff counts/hours incorrect'; END IF; checks:=checks+1;
 snapshot_id:=pm_prepare_planning_cutoff(preview->>'revision',ARRAY[pid]);
 BEGIN PERFORM pm_apply_planning_cutoff(snapshot_id,false); RAISE EXCEPTION 'Unconfirmed cutoff accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; checks:=checks+1;
 result:=pm_apply_planning_cutoff(snapshot_id,true);
 IF (result->>'changed')::int<>2 OR (SELECT end_date FROM pm_allocations WHERE id=a1)<>'2026-10-16' OR (SELECT planning_removed_at FROM pm_allocations WHERE id=a2) IS NULL THEN RAISE EXCEPTION 'Copy cutoff failed'; END IF; checks:=checks+1;
 result:=pm_undo_planning_cutoff(snapshot_id,true);
 IF (result->>'restored')::int<>2 OR (SELECT end_date FROM pm_allocations WHERE id=a1)<>'2026-10-31' OR (SELECT planning_removed_at FROM pm_allocations WHERE id=a2) IS NOT NULL THEN RAISE EXCEPTION 'One-step undo failed'; END IF; checks:=checks+1;
 RESET ROLE;
 IF (SELECT to_jsonb(e) FROM pm_time_entries e WHERE id=entry_id) IS DISTINCT FROM before_entry THEN RAISE EXCEPTION 'Cutoff/undo changed hours or snapshots'; END IF; checks:=checks+1;
 RAISE NOTICE 'PASS: % copy-only timesheet/cutoff checks, staff without planning rights; all writes roll back',checks;
END $test$;
ROLLBACK;
