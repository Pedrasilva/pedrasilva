DO $migration$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.pm_recover_20261018(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'prior_role text;','prior_role text; trigger_states jsonb;');
 definition:=replace(definition,$old$prior_role:=current_setting('session_replication_role');
 PERFORM set_config('session_replication_role','replica',true);$old$,$new$SELECT jsonb_agg(jsonb_build_object('tab',tgrelid::regclass::text,'name',tgname,'state',tgenabled::text)) INTO trigger_states FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.pm_allocations'::regclass,'public.pm_tasks'::regclass,'public.pm_time_entries'::regclass);
 FOR r IN SELECT * FROM jsonb_to_recordset(trigger_states) AS x(tab text,name text,state text) LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I',r.tab,r.name); END LOOP;$new$);
 definition:=replace(definition,$old$PERFORM set_config('session_replication_role',prior_role,true);$old$,$new$FOR r IN SELECT * FROM jsonb_to_recordset(trigger_states) AS x(tab text,name text,state text) LOOP EXECUTE format('ALTER TABLE %s %s TRIGGER %I',r.tab,CASE r.state WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.name); END LOOP;$new$);
 EXECUTE definition;
END $migration$;