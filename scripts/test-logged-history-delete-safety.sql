-- Disposable copies only; every test write rolls back in the inner block.
DO $test$
DECLARE p uuid := gen_random_uuid(); s uuid := gen_random_uuid(); a uuid := gen_random_uuid();
 t uuid; e uuid := gen_random_uuid(); original public.pm_time_entries; res uuid; blocked integer := 0;
BEGIN
 SELECT te.* INTO STRICT original FROM public.pm_time_entries te JOIN public.pm_tasks task ON task.id=te.task_id LIMIT 1;
 SELECT resource_id INTO STRICT res FROM public.pm_allocations LIMIT 1;
 BEGIN
  INSERT INTO public.pm_projects(id,name,start_date) VALUES(p,'RECOVERY SAFETY TEST COPY',original.entry_date);
  INSERT INTO public.pm_stages(id,project_id,name,start_date,end_date,status) VALUES(s,p,'TEST COPY',original.entry_date,original.entry_date,'active');
  INSERT INTO public.pm_allocations(id,stage_id,resource_id,start_date,end_date,hours_per_day) VALUES(a,s,res,original.entry_date,original.entry_date,0);
  SELECT id INTO STRICT t FROM public.pm_tasks WHERE allocation_id=a;
  INSERT INTO public.pm_time_entries SELECT * FROM jsonb_populate_record(NULL::public.pm_time_entries,to_jsonb(original)||jsonb_build_object('id',e,'task_id',t,'pm_stage_id',NULL));
  BEGIN DELETE FROM public.pm_tasks WHERE id=t; EXCEPTION WHEN foreign_key_violation THEN IF SQLERRM NOT LIKE 'logged_history_delete_blocked:%' THEN RAISE; END IF; blocked:=blocked+1; END;
  BEGIN DELETE FROM public.pm_allocations WHERE id=a; EXCEPTION WHEN foreign_key_violation THEN IF SQLERRM NOT LIKE 'logged_history_delete_blocked:%' THEN RAISE; END IF; blocked:=blocked+1; END;
  BEGIN DELETE FROM public.pm_stages WHERE id=s; EXCEPTION WHEN foreign_key_violation THEN IF SQLERRM NOT LIKE 'logged_history_delete_blocked:%' THEN RAISE; END IF; blocked:=blocked+1; END;
  BEGIN DELETE FROM public.pm_projects WHERE id=p; EXCEPTION WHEN foreign_key_violation THEN IF SQLERRM NOT LIKE 'logged_history_delete_blocked:%' THEN RAISE; END IF; blocked:=blocked+1; END;
  IF blocked<>4 THEN RAISE EXCEPTION 'Expected four blocked deletes; got %',blocked; END IF;
  UPDATE public.pm_allocations SET planning_removed_at=now() WHERE id=a;
  IF NOT EXISTS(SELECT 1 FROM public.pm_tasks WHERE id=t) OR NOT EXISTS(SELECT 1 FROM public.pm_time_entries WHERE id=e AND hours=original.hours AND approval_status=original.approval_status) THEN RAISE EXCEPTION 'Retirement changed logged history'; END IF;
  DELETE FROM public.pm_time_entries WHERE id=e;
  DELETE FROM public.pm_allocations WHERE id=a;
  DELETE FROM public.pm_stages WHERE id=s;
  DELETE FROM public.pm_projects WHERE id=p;
  RAISE EXCEPTION 'copy_tests_pass_rollback' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM public.pm_projects WHERE id=p) OR EXISTS(SELECT 1 FROM public.pm_time_entries WHERE id=e) THEN RAISE EXCEPTION 'Test copies remained'; END IF;
 RAISE NOTICE 'PASS: task, allocation, stage and project deletes blocked; retirement preserves history; empty deletes allowed; copies rolled back.';
END $test$;