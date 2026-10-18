CREATE OR REPLACE FUNCTION public.pm_recover_20261018(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; before_hash jsonb := '{}'::jsonb; h text; after_h text; payload_rows jsonb; expected_ids uuid[] := ARRAY['dee37a5f-1240-442b-b73d-a69cea7b2750','fae90c76-da41-42b1-b973-8796a8f7655b','093b1d60-701d-41c2-96bd-f14515a53849','396be523-8875-493e-9535-1cd0e04326e1','091ce472-5aef-49b5-826f-a43b7ab8c414','c1fb1483-cdcc-47b6-a1b5-54d7c7bc8693','b3a2669e-53e9-484b-9edc-c58b1ad73594','76781a43-19ef-41bb-94c3-e5b6a565ddd3','822ce161-429d-435b-910a-99e65841be67','86ddb1cb-f4c8-4b6e-8a8a-27c87b0d1004','b52743a9-0611-449c-b040-5ddbf2e32e4d','6e33af1e-4345-4d46-9a41-6cbbbd6ae1b5','50f73aa2-f369-48f9-910c-81a53cef99dc','c27b2f6f-c6a0-4dc3-9303-61d128bddabd','b219386a-b56a-400c-989f-64e2c7800e9d','f73bac84-a459-4252-926b-91cbefb11161','8db99f52-6ade-4854-9b63-43584bfc97ae','18b1c46d-d944-47f9-9254-95393522ef15','a933ac1f-f144-4dda-b6c6-b9685dcea6f8','f1720d5c-78cf-41c0-8c7d-4577de3995fd','002f5f60-36ba-4e57-8be3-489b629fdb3e','f5535a4f-2237-4981-8f85-fc9cdb84b832','18b12fcd-478b-4515-928c-681a83f3357f','740bc87e-6358-4fb3-961b-bb2158149405','82697889-4689-4bb3-b3d7-d42db22a924b','8ba4793a-dfab-494f-a73b-93cf7ac73b14','4ad0705e-1f57-4a20-87ff-ed5067ddf6da','1b73f9cf-104a-41ac-ab76-30ee195828f1','72fddf22-083c-46bb-899e-36cd2fcaa698','4ba9b268-6793-4c52-9ae8-8b4db4a6262c','07736ad6-f910-43e7-a0a7-2aca018774d4','7faddfc2-9917-4327-8777-ddef692a8d85','fe941aaf-6348-48b9-8d7c-ef3fdecc5d40','2077a5a5-37d2-4962-8d8d-6319a68845e0']::uuid[]; bad bigint; prior_role text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF jsonb_array_length(p_payload->'pm_allocations')<>34 OR jsonb_array_length(p_payload->'pm_tasks')<>34 OR jsonb_array_length(p_payload->'pm_time_entries')<>380 THEN RAISE EXCEPTION 'Recovery counts mismatch'; END IF;
 IF (SELECT sum((x->>'hours')::numeric) FROM jsonb_array_elements(p_payload->'pm_time_entries')x)<>1786.24 THEN RAISE EXCEPTION 'Recovery hours mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'pm_allocations')x WHERE NOT (x->>'id')::uuid=ANY(expected_ids)) OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_payload->'pm_allocations')x)<>34 THEN RAISE EXCEPTION 'Unapproved allocations'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'pm_tasks')x WHERE NOT (x->>'allocation_id')::uuid=ANY(expected_ids)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'pm_time_entries')e WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'pm_tasks')t WHERE t->>'id'=e->>'task_id')) THEN RAISE EXCEPTION 'Recovery links mismatch'; END IF;
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',r.relname);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pm_allocations WHERE id=ANY(expected_ids)) THEN RAISE EXCEPTION 'Recovery already performed or partial conflict'; END IF;
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'''','' '' ORDER BY to_jsonb(t)::text),'''')) FROM public.%I t',r.relname) INTO h;
  before_hash:=before_hash||jsonb_build_object(r.relname,h);
 END LOOP;
 prior_role:=current_setting('session_replication_role');
 PERFORM set_config('session_replication_role','replica',true);
 INSERT INTO public.pm_allocations SELECT * FROM jsonb_populate_recordset(NULL::public.pm_allocations,p_payload->'pm_allocations');
 INSERT INTO public.pm_tasks SELECT * FROM jsonb_populate_recordset(NULL::public.pm_tasks,p_payload->'pm_tasks');
 INSERT INTO public.pm_time_entries SELECT * FROM jsonb_populate_recordset(NULL::public.pm_time_entries,p_payload->'pm_time_entries');
 PERFORM set_config('session_replication_role',prior_role,true);
 FOR r IN SELECT c.conrelid::regclass tab,c.confrelid::regclass parent,a.attname col,b.attname parent_col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1] WHERE c.contype='f' AND c.conrelid IN ('pm_allocations'::regclass,'pm_tasks'::regclass,'pm_time_entries'::regclass) LOOP
  EXECUTE format('SELECT count(*) FROM %s t WHERE t.%I IS NOT NULL AND NOT EXISTS(SELECT 1 FROM %s p WHERE p.%I=t.%I)',r.tab,r.col,r.parent,r.parent_col,r.col) INTO bad;
  IF bad<>0 THEN RAISE EXCEPTION 'Recovery foreign key validation failed: %',r.col; END IF;
 END LOOP;
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname LOOP
  payload_rows:=coalesce(p_payload->r.relname,'[]'::jsonb);
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'''','' '' ORDER BY to_jsonb(t)::text),'''')) FROM public.%I t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements($1)x WHERE x->>''id''=to_jsonb(t)->>''id'')',r.relname) INTO after_h USING payload_rows;
  IF after_h IS DISTINCT FROM before_hash->>r.relname THEN RAISE EXCEPTION 'Unrelated data changed in %',r.relname; END IF;
  IF r.relname IN ('pm_allocations','pm_tasks','pm_time_entries') THEN
   EXECUTE format('SELECT count(*) FROM jsonb_populate_recordset(NULL::public.%I,$1) b LEFT JOIN public.%I t ON t.id=b.id WHERE to_jsonb(t) IS DISTINCT FROM to_jsonb(b)',r.relname,r.relname) INTO bad USING payload_rows;
   IF bad<>0 THEN RAISE EXCEPTION 'Exact row verification failed: %',r.relname; END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('allocations',34,'tasks',34,'entries',380,'hours',1786.24,'exact_rows',true,'unrelated_tables_unchanged',true,'checked_tables',jsonb_object_length(before_hash));
END $$;
REVOKE ALL ON FUNCTION public.pm_recover_20261018(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_recover_20261018(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pm_recover_20261018(jsonb) IS 'One-shot admin recovery limited to the approved 34 allocation IDs; refuses any existing target allocation. Disable after recovery.';