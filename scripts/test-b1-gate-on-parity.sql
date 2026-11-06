-- B1 gate-ON parity test. Read-only; everything runs in ONE transaction that is
-- always rolled back by the final RAISE (the error message carries the result).
-- The recorded gate is replaced by `SELECT true` only inside this transaction:
-- no audit row, no identity/revision consumed, no other session affected.
-- Run through the database tool. PASS = message starts with B1_PARITY_PASS.
DO $parity$
DECLARE
  luis uuid := 'ab5a48c0-939b-4502-bd3b-db7801f0f8b8';
  rita uuid := '8e8fa5d7-e287-4d0a-94f6-587fce848200';
  patricia uuid := '4d2a2d60-fab6-42a5-b08c-03b7008c2170';
  mint uuid := 'da46fd5d-309f-4f9f-b0d6-107cd61dc907';
  uralchem uuid := '32810ca9-3c97-4eee-a6b7-a8385a19c972';
  u uuid; p uuid; snap jsonb := '{}'::jsonb; one jsonb; k text; checks int := 0;
  fin_keys text[] := ARRAY['budget','sold_fee','sold_internal_fee','sold_external_fee','baseline_budget','retainer_monthly_amount','markup_pct','cost_rate','hourly_rate','sale_rate','cost_rate_snapshot','sale_rate_snapshot'];
  leaked int; areas jsonb; cost numeric; billable numeric; pursuit_cost numeric; hist_cost numeric;
BEGIN
  IF (SELECT after_active FROM public.pm_project_b1_cutover_audit ORDER BY revision DESC LIMIT 1) THEN
    RAISE EXCEPTION 'Recorded B1 gate must be OFF before this test';
  END IF;
  -- Gate ON for this transaction only (rolled back below).
  EXECUTE 'CREATE OR REPLACE FUNCTION public.pm_project_b1_recorded_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS ''SELECT true''';
  PERFORM set_config('request.headers','{}',true);

  FOREACH u IN ARRAY ARRAY[luis,rita,patricia] LOOP
    FOREACH p IN ARRAY ARRAY[mint,uralchem] LOOP
      PERFORM set_config('request.jwt.claim.sub',u::text,true);
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
      SET LOCAL ROLE authenticated;
      IF NOT public.pm_project_b1_active() THEN RAISE EXCEPTION 'Gate not ON inside test'; END IF;
      one := jsonb_build_object(
        'areas', public.pm_project_viewer_areas(p),
        'projects', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_projects(p) x),
        'stages', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_stages(p) x),
        'entries', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_entries(p) x),
        'resources', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_resources(p) x),
        'history', (SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]') FROM public.pm_b1_history(p) x),
        'hours', (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.stage_id,h.month),'[]') FROM public.pm_b1_stage_hours(p) h),
        'locked', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.stage_id,l.month),'[]') FROM public.pm_b1_stage_locked_cost(p) l),
        'pursuit', (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.resource_id),'[]') FROM public.pm_b1_pursuit(p,false) q),
        'global_projects', CASE WHEN p=mint THEN (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_projects(NULL) x) END,
        'global_stages', CASE WHEN p=mint THEN (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM public.pm_b1_stages(NULL) x) END,
        'global_areas', CASE WHEN p=mint THEN (SELECT coalesce(jsonb_object_agg(g.id, public.pm_project_viewer_areas(g.id)),'{}') FROM public.pm_projects g WHERE NOT g.finance_only) END
      );
      RESET ROLE;
      snap := jsonb_set(snap, ARRAY[u::text], coalesce(snap->u::text,'{}') || jsonb_build_object(p::text, one));
    END LOOP;
  END LOOP;

  -- (1) Rita = Luis on Mint for every gate-ON reader the project page uses.
  FOREACH k IN ARRAY ARRAY['projects','stages','entries','resources','history','hours','locked','pursuit'] LOOP
    IF snap->rita::text->mint::text->k IS DISTINCT FROM snap->luis::text->mint::text->k THEN
      RAISE EXCEPTION 'B1_PARITY_FAIL Rita<>Luis on Mint reader %: rita=% luis=%', k,
        jsonb_array_length(snap->rita::text->mint::text->k), jsonb_array_length(snap->luis::text->mint::text->k);
    END IF; checks := checks + 1;
  END LOOP;
  areas := snap->rita::text->mint::text->'areas';
  IF NOT ((areas->>'financials')::boolean AND (areas->>'budget_cost')::boolean AND (areas->>'expenses')::boolean AND (areas->>'supplier_fees')::boolean) THEN
    RAISE EXCEPTION 'B1_PARITY_FAIL Rita Mint areas not all ON: %', areas; END IF; checks := checks + 1;

  -- Shared cost inputs (identical for both, asserted above): locked snapshots + pursuit snapshots.
  SELECT sum((l->>'snap_cost')::numeric), sum((l->>'unsnap_hours')::numeric) INTO cost, billable FROM jsonb_array_elements(snap->rita::text->mint::text->'locked') l;
  IF billable <> 0 THEN RAISE EXCEPTION 'B1_PARITY_FAIL Mint has hours without cost snapshot: %', billable; END IF;
  SELECT sum((q->>'snapshot_cost')::numeric) INTO pursuit_cost FROM jsonb_array_elements(snap->rita::text->mint::text->'pursuit') q;
  SELECT sum((h->>'cost')::numeric) INTO hist_cost FROM jsonb_array_elements(snap->rita::text->mint::text->'history') h;
  SELECT sum((e->>'hours')::numeric) FILTER (WHERE (e->>'billable')::boolean) INTO billable FROM jsonb_array_elements(snap->rita::text->mint::text->'entries') e;
  checks := checks + 1;

  -- (2) Patricia: no financial figure on Mint or Uralchem page readers, and none in global Gantt readers.
  FOREACH p IN ARRAY ARRAY[mint,uralchem] LOOP
    areas := snap->patricia::text->p::text->'areas';
    IF (areas->>'financials')::boolean OR (areas->>'budget_cost')::boolean THEN RAISE EXCEPTION 'B1_PARITY_FAIL Patricia has financial area on %', p; END IF;
    SELECT count(*) INTO leaked FROM jsonb_array_elements((snap->patricia::text->p::text->'projects') || (snap->patricia::text->p::text->'stages') || (snap->patricia::text->p::text->'entries') || (snap->patricia::text->p::text->'resources')) r, unnest(fin_keys) f
      WHERE r ? f AND jsonb_typeof(r->f) = 'number';
    IF leaked > 0 THEN RAISE EXCEPTION 'B1_PARITY_FAIL Patricia sees % financial numbers on %', leaked, p; END IF;
    IF jsonb_array_length(snap->patricia::text->p::text->'locked') > 0 THEN RAISE EXCEPTION 'B1_PARITY_FAIL Patricia receives locked cost on %', p; END IF;
    SELECT count(*) INTO leaked FROM jsonb_array_elements(snap->patricia::text->p::text->'pursuit') q WHERE jsonb_typeof(q->'snapshot_cost')='number';
    IF leaked > 0 THEN RAISE EXCEPTION 'B1_PARITY_FAIL Patricia receives pursuit cost on %', p; END IF;
    SELECT count(*) INTO leaked FROM jsonb_array_elements(snap->patricia::text->p::text->'history') h WHERE jsonb_typeof(h->'cost')='number' OR jsonb_typeof(h->'amount')='number';
    IF leaked > 0 THEN RAISE EXCEPTION 'B1_PARITY_FAIL Patricia receives historical value on %', p; END IF;
    checks := checks + 5;
  END LOOP;
  -- Global Gantt: every project row/stage where Patricia lacks Financials/Budget carries no number.
  SELECT count(*) INTO leaked
    FROM jsonb_array_elements((snap->patricia::text->mint::text->'global_projects') || (snap->patricia::text->mint::text->'global_stages')) r, unnest(fin_keys) f
   WHERE r ? f AND jsonb_typeof(r->f)='number'
     AND NOT coalesce((snap->patricia::text->mint::text->'global_areas'->coalesce(r->>'project_id',r->>'id')->>'budget_cost')::boolean,false)
     AND NOT coalesce((snap->patricia::text->mint::text->'global_areas'->coalesce(r->>'project_id',r->>'id')->>'financials')::boolean,false);
  IF leaked > 0 THEN RAISE EXCEPTION 'B1_PARITY_FAIL Patricia global Gantt receives % financial numbers', leaked; END IF;
  checks := checks + 1;

  RAISE EXCEPTION 'B1_PARITY_PASS %', jsonb_build_object('checks',checks,
    'mint_locked_cost',cost,'mint_pursuit_cost',pursuit_cost,'mint_history_cost',coalesce(hist_cost,0),
    'mint_billable_hours',billable,'rita_entries',jsonb_array_length(snap->rita::text->mint::text->'entries'),
    'luis_entries',jsonb_array_length(snap->luis::text->mint::text->'entries'),
    'rita_resources',jsonb_array_length(snap->rita::text->mint::text->'resources'),
    'patricia_global_projects',jsonb_array_length(snap->patricia::text->mint::text->'global_projects'));
END $parity$;
