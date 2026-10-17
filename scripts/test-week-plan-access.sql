-- Run through the privileged database SQL tool. Every mutation rolls back.
-- No allocations, timesheets, costs or stage dates are changed.
BEGIN;
DO $test$
DECLARE
 planner uuid; staff uuid; outsider uuid; u record; q text; denied boolean; n integer;
 r uuid; inactive_r uuid; project uuid; other_project uuid; stage uuid; d date; w date; pid uuid;
 result jsonb; old_time timestamptz; new_time timestamptz; bad jsonb; good jsonb; changes jsonb;
 allocation_hash text; stage_hash text; actual text[]; role_name text; tbl text; operation text;
BEGIN
 SELECT md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) INTO allocation_hash FROM public.pm_allocations a;
 SELECT md5(coalesce(string_agg(id::text||start_date::text||end_date::text,'' ORDER BY id),'')) INTO stage_hash FROM public.pm_stages;
 -- Real identities, evaluated with their own claims; no invented auth accounts.
 FOR u IN SELECT id FROM auth.users LOOP
  PERFORM set_config('request.jwt.claim.sub',u.id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role','authenticated')::text,true);
  IF public.is_psa_staff() THEN
   IF public.has_role(u.id,'admin') OR public.has_module_permission(u.id,'projects.edit_planning','all') THEN planner:=coalesce(planner,u.id); ELSE staff:=coalesce(staff,u.id); END IF;
  ELSE outsider:=coalesce(outsider,u.id); END IF;
 END LOOP;
 IF planner IS NULL OR staff IS NULL OR outsider IS NULL THEN RAISE EXCEPTION 'Need real planner, staff non-planner and non-staff fixtures'; END IF;
 SELECT s.id,s.project_id,g.day::date INTO stage,project,d FROM public.pm_stages s JOIN public.pm_projects p ON p.id=s.project_id
 CROSS JOIN LATERAL generate_series(s.start_date,s.end_date,'1 day') g(day)
 WHERE p.status='active' AND s.archived_at IS NULL AND NOT coalesce(s.is_milestone,false) AND coalesce(s.stage_kind,'')<>'retainer_monthly' AND coalesce(s.status::text,'planned')<>'cancelled'
 AND NOT EXISTS(SELECT 1 FROM public.pm_stages c WHERE c.parent_stage_id=s.id AND c.archived_at IS NULL AND coalesce(c.status::text,'planned')<>'cancelled')
 AND extract(isodow FROM g.day)=1 AND NOT EXISTS(SELECT 1 FROM public.holidays h WHERE h.data=g.day::date)
 AND NOT EXISTS(SELECT 1 FROM public.pm_week_plans p WHERE p.week_start=g.day::date) LIMIT 1;
 w:=d;
 SELECT id INTO r FROM public.pm_resources pr WHERE active AND NOT EXISTS(SELECT 1 FROM public.vacation_requests v WHERE v.collaborator_id=pr.collaborator_id AND v.estado IN ('aprovada','aprovado') AND d BETWEEN v.data_inicio AND v.data_fim) LIMIT 1;
 SELECT id INTO other_project FROM public.pm_projects WHERE status='active' AND id<>project LIMIT 1;
 IF r IS NULL OR stage IS NULL OR other_project IS NULL THEN RAISE EXCEPTION 'Need eligible resource, stage and free weekday'; END IF;
 -- Grants are checked as owner because role_table_grants is caller-filtered.
 FOREACH tbl IN ARRAY ARRAY['pm_week_plans','pm_week_plan_slots'] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','PUBLIC','authenticated'] LOOP
   SELECT array_agg(privilege_type ORDER BY privilege_type) INTO actual FROM information_schema.role_table_grants g WHERE g.table_schema='public' AND g.table_name=tbl AND g.grantee=role_name;
   IF role_name='authenticated' THEN IF actual IS DISTINCT FROM ARRAY['DELETE','INSERT','SELECT','UPDATE'] THEN RAISE EXCEPTION 'Unexpected authenticated grants: % %',tbl,actual; END IF;
   ELSIF actual IS NOT NULL THEN RAISE EXCEPTION 'Unexpected public grants: % %',tbl,actual; END IF;
  END LOOP;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',planner::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',planner,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 result:=public.pm_week_draft(w,'create'); pid:=(result->'board'->'plan'->>'id')::uuid;
 IF pid IS NULL OR NOT (result->>'created')::boolean THEN RAISE EXCEPTION 'Planner create failed'; END IF;
 IF (public.pm_week_draft(w,'create')->>'created')::boolean THEN RAISE EXCEPTION 'Second create did not return existing draft'; END IF;
 SELECT updated_at INTO old_time FROM public.pm_week_plans WHERE id=pid;
 INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id) VALUES(pid,r,d,'am',project,stage);
 SELECT updated_at INTO new_time FROM public.pm_week_plans WHERE id=pid;
 IF new_time<=old_time OR NOT EXISTS(SELECT 1 FROM public.pm_week_plans WHERE id=pid AND updated_by=planner) THEN RAISE EXCEPTION 'Insert did not touch parent audit'; END IF;
 old_time:=new_time;
 UPDATE public.pm_week_plan_slots SET is_site_visit=true WHERE plan_id=pid;
 IF (SELECT updated_at FROM public.pm_week_plans WHERE id=pid)<=old_time THEN RAISE EXCEPTION 'Update did not touch parent'; END IF;
 -- Negative slot paths: exceptions must happen, not just a zero-row write.
 FOREACH q IN ARRAY ARRAY[
  format('INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id) VALUES(%L,%L,%L,''pm'',%L,%L)',pid,r,d,other_project,stage),
  format('INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id) VALUES(%L,%L,%L,''pm'',%L,%L)',pid,r,d+5,project,stage),
  format('INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id) VALUES(%L,%L,%L,''am'',%L,%L)',pid,r,d,project,stage)
 ] LOOP
  denied:=false; BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Slot guard did not reject: %',q; END IF;
 END LOOP;
 good:=jsonb_build_array(jsonb_build_object('project_id',project,'stage_id',stage,'from',d,'until',d+4,'resource_id',r));
 UPDATE public.pm_week_plans SET notes=good WHERE id=pid;
 FOREACH bad IN ARRAY ARRAY['{}'::jsonb,'[{}]'::jsonb,jsonb_build_array(jsonb_build_object('project_id','bad','stage_id',stage,'until',d)),jsonb_build_array(jsonb_build_object('project_id',project,'stage_id',stage,'until','2026-02-30')),good||jsonb_build_array(jsonb_build_object('project_id',project,'stage_id',stage,'until',d,'extra',1)),(SELECT jsonb_agg(good->0) FROM generate_series(1,51))] LOOP
  denied:=false; BEGIN UPDATE public.pm_week_plans SET notes=bad WHERE id=pid; EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Invalid notes accepted: %',bad; END IF;
 END LOOP;
 denied:=false; BEGIN PERFORM public.pm_week_draft(w,'discard','[]',old_time); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale discard accepted'; END IF;
 changes:=(SELECT jsonb_agg(jsonb_build_object('resource_id',r,'day',d,'part','pm','before',NULL,'after',NULL)) FROM generate_series(1,500));
 PERFORM public.pm_week_draft(w,'save',changes);
 denied:=false; BEGIN PERFORM public.pm_week_draft(w,'save',changes||(changes->0)); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION '501 changes accepted'; END IF;
 -- Approved fixtures only in this rolled-back transaction; no production setter exists.
 PERFORM set_config('app.pm_week_plan_apply','1',true);
 UPDATE public.pm_week_plans SET status='approved',notes=good WHERE id=pid;
 PERFORM set_config('app.pm_week_plan_apply','',true);
 FOREACH q IN ARRAY ARRAY[
  format('INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id) VALUES(%L,%L,%L,''pm'',%L)',pid,r,d,project),
  format('UPDATE public.pm_week_plan_slots SET is_site_visit=false WHERE plan_id=%L',pid),
  format('DELETE FROM public.pm_week_plan_slots WHERE plan_id=%L',pid),
  format('UPDATE public.pm_week_plans SET notes=''[]'' WHERE id=%L',pid),
  format('DELETE FROM public.pm_week_plans WHERE id=%L',pid)
 ] LOOP
  denied:=false; BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Approved mutation accepted: %',q; END IF;
 END LOOP;
 PERFORM set_config('app.pm_week_plan_apply','1',true);
 INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id) VALUES(pid,r,d,'pm',project);
 UPDATE public.pm_week_plan_slots SET is_site_visit=false WHERE plan_id=pid;
 DELETE FROM public.pm_week_plan_slots WHERE plan_id=pid AND part='pm';
 PERFORM set_config('app.pm_week_plan_apply','',true);
 RESET ROLE;
 -- Staff retain Stage 1 board read, but neither table nor draft RPC access.
 FOR u IN SELECT staff id,'staff' label UNION ALL SELECT outsider,'nonstaff' UNION ALL SELECT NULL::uuid,'anon' LOOP
  PERFORM set_config('request.jwt.claim.sub',coalesce(u.id::text,''),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role',CASE WHEN u.id IS NULL THEN 'anon' ELSE 'authenticated' END)::text,true);
  IF u.id IS NULL THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
  FOREACH tbl IN ARRAY ARRAY['pm_week_plans','pm_week_plan_slots'] LOOP
   denied:=false; BEGIN EXECUTE format('SELECT count(*) FROM public.%I',tbl) INTO n; denied:=n=0; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   IF NOT denied THEN RAISE EXCEPTION 'Unauthorized table read: % %',u.label,tbl; END IF;
   FOREACH operation IN ARRAY ARRAY['insert','update','delete'] LOOP
    IF operation='insert' THEN q:=CASE WHEN tbl='pm_week_plans' THEN format('INSERT INTO public.pm_week_plans(week_start) VALUES(%L)',w+7) ELSE format('INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id) VALUES(%L,%L,%L,''pm'',%L)',pid,r,d,project) END;
    ELSIF operation='update' THEN q:=CASE WHEN tbl='pm_week_plans' THEN format('UPDATE public.pm_week_plans SET notes=''[]'' WHERE id=%L',pid) ELSE format('UPDATE public.pm_week_plan_slots SET is_site_visit=false WHERE plan_id=%L',pid) END;
    ELSE q:=format('DELETE FROM public.%I WHERE %I=%L',tbl,CASE WHEN tbl='pm_week_plans' THEN 'id' ELSE 'plan_id' END,pid); END IF;
    denied:=false; BEGIN EXECUTE q; GET DIAGNOSTICS n=ROW_COUNT; denied:=n=0; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Unauthorized table mutation: % % %',u.label,tbl,operation; END IF;
   END LOOP;
  END LOOP;
  FOREACH operation IN ARRAY ARRAY['create','save','discard'] LOOP
   denied:=false; BEGIN PERFORM public.pm_week_draft(w,operation); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   IF NOT denied THEN RAISE EXCEPTION 'Unauthorized RPC: % %',u.label,operation; END IF;
  END LOOP;
  IF u.label='staff' THEN
   result:=public.pm_week_board(w);
   IF result->'plan'->'notes'<>'[]'::jsonb OR result->'draft_slots'<>'[]'::jsonb THEN RAISE EXCEPTION 'Private notes or slots leaked'; END IF;
  ELSE
   denied:=false; BEGIN PERFORM public.pm_week_board(w); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   IF NOT denied THEN RAISE EXCEPTION 'Nonstaff/anon board allowed'; END IF;
  END IF;
  RESET ROLE;
 END LOOP;
 -- Data-dependent guards use rolled-back resource/project state only, never stage dates.
 PERFORM set_config('request.jwt.claim.sub',planner::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',planner,'role','authenticated')::text,true);
 PERFORM set_config('app.pm_week_plan_apply','1',true); UPDATE public.pm_week_plans SET status='draft' WHERE id=pid; PERFORM set_config('app.pm_week_plan_apply','',true);
 SELECT updated_at INTO old_time FROM public.pm_week_plans WHERE id=pid;
 DELETE FROM public.pm_week_plan_slots WHERE plan_id=pid;
 IF (SELECT updated_at FROM public.pm_week_plans WHERE id=pid)<=old_time THEN RAISE EXCEPTION 'Delete did not touch parent'; END IF;
 UPDATE public.pm_resources SET active=false WHERE id=r;
 SET LOCAL ROLE authenticated;
 denied:=false; BEGIN INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id) VALUES(pid,r,d,'am',project); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Inactive resource accepted'; END IF;
 RESET ROLE; UPDATE public.pm_resources SET active=true WHERE id=r;
 UPDATE public.pm_projects SET status='paused' WHERE id=project;
 SET LOCAL ROLE authenticated;
 denied:=false; BEGIN INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id) VALUES(pid,r,d,'am',project); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Inactive project accepted'; END IF;
 RESET ROLE; UPDATE public.pm_projects SET status='active' WHERE id=project;
 -- Out-of-range stage: same project/stage but a different week beyond its end.
 w:=date_trunc('week',(SELECT end_date FROM public.pm_stages WHERE id=stage)+14)::date;
 SET LOCAL ROLE authenticated;
 result:=public.pm_week_draft(w,'create');
 denied:=false; BEGIN INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id,stage_id) VALUES((result->'board'->'plan'->>'id')::uuid,r,w,'am',project,stage); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Out-of-range stage accepted'; END IF;
 PERFORM public.pm_week_draft(w,'discard','[]',(result->'board'->'plan'->>'updated_at')::timestamptz);
 RESET ROLE;
 -- Existing holiday is enough to exercise the common holiday/leave rejection path.
 SELECT data INTO d FROM public.holidays WHERE extract(isodow FROM data)<6 LIMIT 1;
 IF d IS NULL THEN RAISE EXCEPTION 'Need holiday fixture'; END IF;
 w:=date_trunc('week',d)::date;
 SET LOCAL ROLE authenticated;
 result:=public.pm_week_draft(w,'create');
 denied:=false; BEGIN INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id) VALUES((result->'board'->'plan'->>'id')::uuid,r,d,'am',project); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Holiday accepted'; END IF;
 RESET ROLE;
 -- A real approved leave day (not a holiday) exercises its distinct source.
 SELECT pr.id,g.day::date INTO r,d FROM public.vacation_requests v JOIN public.pm_resources pr ON pr.collaborator_id=v.collaborator_id
 CROSS JOIN LATERAL generate_series(v.data_inicio,v.data_fim,'1 day') g(day)
 WHERE v.estado IN ('aprovada','aprovado') AND pr.active AND extract(isodow FROM g.day)<6 AND NOT EXISTS(SELECT 1 FROM public.holidays h WHERE h.data=g.day::date) LIMIT 1;
 IF r IS NULL THEN RAISE EXCEPTION 'Need approved leave fixture'; END IF;
 w:=date_trunc('week',d)::date;
 SET LOCAL ROLE authenticated;
 result:=public.pm_week_draft(w,'create');
 denied:=false; BEGIN INSERT INTO public.pm_week_plan_slots(plan_id,resource_id,day,part,project_id) VALUES((result->'board'->'plan'->>'id')::uuid,r,d,'am',project); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='Leave and holidays cannot be painted'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Leave day accepted'; END IF;
 RESET ROLE;
 IF allocation_hash IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) FROM public.pm_allocations a) OR stage_hash IS DISTINCT FROM (SELECT md5(coalesce(string_agg(id::text||start_date::text||end_date::text,'' ORDER BY id),'')) FROM public.pm_stages) THEN RAISE EXCEPTION 'Allocations or stage dates changed'; END IF;
 RAISE NOTICE 'PASS: grants, real identities, table CRUD, RPCs, guards, audit, notes, limits, approval flag, idempotent create and stale discard';
END $test$;
ROLLBACK;