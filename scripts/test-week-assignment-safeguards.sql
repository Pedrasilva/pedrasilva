-- Disposable fixtures only; every write, including successful approval, rolls back.
BEGIN;
DO $test$
DECLARE
 admin_id uuid; pid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); child uuid:=gen_random_uuid(); aid uuid:=gen_random_uuid(); planid uuid:=gen_random_uuid();
 w date:='2098-06-09'; preview jsonb; board jsonb; before_hash text; checks integer:=0;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 IF admin_id IS NULL THEN RAISE EXCEPTION 'Missing admin fixture'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 SELECT md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) INTO before_hash FROM public.pm_allocations a;
 INSERT INTO public.pm_projects(id,name,start_date) VALUES(pid,'Disposable assignment safeguards',w);
 INSERT INTO public.pm_resources(id,name) VALUES(rid,'Disposable assignment collaborator');
 INSERT INTO public.pm_stages(id,project_id,name,start_date,end_date) VALUES(sid,pid,'Architecture',w,w+11);
 -- Build the legacy parent case without bypassing the new-booking guard.
 INSERT INTO public.pm_allocations(id,stage_id,resource_id,start_date,end_date,hours_per_day) VALUES(aid,sid,rid,w,w+11,0);
 INSERT INTO public.pm_stages(id,project_id,parent_stage_id,name,start_date,end_date) VALUES(child,pid,sid,'Leaf',w,w+11);
 INSERT INTO public.pm_week_plans(id,week_start) VALUES(planid,w);
 board:=public.pm_week_board(w);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(board->'allocations') a WHERE a->>'id'=aid::text AND (a->>'hours_per_day')::numeric=0) THEN RAISE EXCEPTION 'Zero parent assignment hidden'; END IF; checks:=checks+1;
 BEGIN INSERT INTO public.pm_allocations(stage_id,resource_id,start_date,end_date,hours_per_day) VALUES(sid,rid,w,w+4,0); RAISE EXCEPTION 'Parent insert accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END; checks:=checks+1;
 BEGIN INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id) VALUES(planid,rid,w,'am',pid,sid); RAISE EXCEPTION 'Parent slot accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Stage is not allocatable for this project and day' THEN RAISE; END IF; END; checks:=checks+1;
 preview:=public.pm_preview_week_plan(planid);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'operations') o WHERE o->'before'->>'id'=aid::text AND o->>'action'='change') THEN RAISE EXCEPTION 'Empty-draft parent mutation missing'; END IF; checks:=checks+1;
 BEGIN PERFORM public.pm_apply_week_plan_confirmed(planid,preview->>'token','[]',false,false,gen_random_uuid(),false); RAISE EXCEPTION 'Unacknowledged change accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END; checks:=checks+1;
 BEGIN PERFORM public.pm_apply_week_plan(planid,preview->>'token'); RAISE EXCEPTION 'Legacy bypass accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END; checks:=checks+1;
 IF (SELECT end_date FROM public.pm_allocations WHERE id=aid)<>w+11 OR (SELECT status FROM public.pm_week_plans WHERE id=planid)<>'draft' THEN RAISE EXCEPTION 'Rejected approval mutated fixture'; END IF; checks:=checks+1;
 BEGIN PERFORM public.pm_apply_week_plan_confirmed(planid,'stale','[]',false,false,gen_random_uuid(),true); RAISE EXCEPTION 'Stale token accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END; checks:=checks+1;
 -- Fully acknowledged publication is tested only in a rolled-back subtransaction.
 BEGIN
  PERFORM public.pm_apply_week_plan_confirmed(planid,preview->>'token','[]',false,false,gen_random_uuid(),true);
  IF (SELECT start_date FROM public.pm_allocations WHERE id=aid)<>w+7 THEN RAISE EXCEPTION 'Confirmed outside-week trim failed'; END IF;
  RAISE EXCEPTION 'fixture_rollback';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'fixture_rollback' THEN RAISE; END IF; END; checks:=checks+1;
 IF (SELECT status FROM public.pm_week_plans WHERE id=planid)<>'draft' OR EXISTS(SELECT 1 FROM public.pm_week_publications WHERE plan_id=planid) THEN RAISE EXCEPTION 'Interrupted approval retained state'; END IF; checks:=checks+1;
 IF before_hash<>(SELECT md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) FROM public.pm_allocations a WHERE id<>aid) THEN RAISE EXCEPTION 'Unrelated allocation changed'; END IF; checks:=checks+1;
 RAISE NOTICE 'PASS: % disposable assignment safeguards; all fixtures roll back',checks;
END $test$;
ROLLBACK;