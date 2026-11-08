-- B1 preview marker test. Read-only; ONE transaction, always rolled back by the
-- final RAISE (the message carries the result). Recorded gate stays as it is
-- (must be OFF). PASS = message starts with B1_MARKER_PASS.
-- Asserts: (a) a non-admin sending x-psa-b1-preview: on gets exactly the B1 OFF
-- result (gate false, identical reader output to no marker); (b) an admin's
-- marker is ignored in a read-write (write) transaction; (c) the cutover action
-- refuses any marker; (d) an admin's marker counts only in a read-only transaction.
-- Run through the database SQL tool (needs SET ROLE). Last run 2026-11-08: B1_MARKER_PASS 10 checks.
DO $marker$
DECLARE
  luis uuid := 'ab5a48c0-939b-4502-bd3b-db7801f0f8b8';
  rita uuid := '8e8fa5d7-e287-4d0a-94f6-587fce848200';
  patricia uuid := '4d2a2d60-fab6-42a5-b08c-03b7008c2170';
  tatiana uuid := 'a5053861-594d-47fc-b955-2b0ad0b87e84';
  mint uuid := 'da46fd5d-309f-4f9f-b0d6-107cd61dc907';
  uralchem uuid := '32810ca9-3c97-4eee-a6b7-a8385a19c972';
  u uuid; p uuid; checks int := 0; plain jsonb; marked jsonb; refused boolean;
BEGIN
  IF (SELECT after_active FROM public.pm_project_b1_cutover_audit ORDER BY revision DESC LIMIT 1) THEN
    RAISE EXCEPTION 'Recorded B1 gate must be OFF before this test';
  END IF;
  SET LOCAL ROLE authenticated;

  -- (b) admin marker inside a read-write transaction: ignored.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',luis,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{"x-psa-b1-preview":"on"}',true);
  IF current_setting('transaction_read_only')<>'off' THEN RAISE EXCEPTION 'expected read-write here'; END IF;
  IF public.pm_project_b1_active() THEN RAISE EXCEPTION 'FAIL admin marker honoured in a write transaction'; END IF;
  checks := checks+1;
  -- (c) cutover action refuses a marker (no audit row can be written).
  refused := false;
  BEGIN PERFORM public.pm_change_project_b1_cutover(true,false,'x','marker test');
  EXCEPTION WHEN others THEN refused := SQLERRM='Preview requests cannot change the cutover'; END;
  IF NOT refused THEN RAISE EXCEPTION 'FAIL cutover action did not refuse the marker'; END IF;
  checks := checks+1;

  -- From here on: read-only, exactly like PostgREST reads.
  SET LOCAL transaction_read_only = on;

  -- (a) non-admins: marker ignored, identical OFF output.
  FOREACH u IN ARRAY ARRAY[rita,patricia,tatiana] LOOP
    FOREACH p IN ARRAY ARRAY[mint,uralchem] LOOP
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
      PERFORM set_config('request.headers','{}',true);
      plain := jsonb_build_object('gate',public.pm_project_b1_gate_state(),
        'projects',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_projects(p) x),
        'stages',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_stages(p) x),
        'entries',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_entries(p) x),
        'resources',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_resources(p) x),
        'locked',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.stage_id,l.month),'[]') FROM public.pm_b1_stage_locked_cost(p) l),
        'pursuit',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.resource_id),'[]') FROM public.pm_b1_pursuit(p,false) q));
      PERFORM set_config('request.headers','{"x-psa-b1-preview":"on"}',true);
      IF public.pm_project_b1_active() OR public.pm_project_b1_header_preview() THEN
        RAISE EXCEPTION 'FAIL marker honoured for non-admin %', u;
      END IF;
      marked := jsonb_build_object('gate',public.pm_project_b1_gate_state(),
        'projects',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_projects(p) x),
        'stages',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_stages(p) x),
        'entries',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_entries(p) x),
        'resources',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_resources(p) x),
        'locked',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.stage_id,l.month),'[]') FROM public.pm_b1_stage_locked_cost(p) l),
        'pursuit',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.resource_id),'[]') FROM public.pm_b1_pursuit(p,false) q));
      IF plain IS DISTINCT FROM marked THEN RAISE EXCEPTION 'FAIL marker changed the result for %/%', u, p; END IF;
      IF (marked->'gate'->>'effective')::boolean THEN RAISE EXCEPTION 'FAIL effective gate ON for %', u; END IF;
      checks := checks+1;
    END LOOP;
  END LOOP;

  -- (d) admin marker in a read-only transaction: preview counts (positive control).
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',luis,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{"x-psa-b1-preview":"on"}',true);
  IF NOT public.pm_project_b1_active() THEN RAISE EXCEPTION 'FAIL admin preview not honoured in read-only transaction'; END IF;
  PERFORM set_config('request.headers','{}',true);
  IF public.pm_project_b1_active() THEN RAISE EXCEPTION 'FAIL gate ON without marker'; END IF;
  checks := checks+2;

  RAISE EXCEPTION 'B1_MARKER_PASS % checks (rolled back)', checks;
END $marker$;
