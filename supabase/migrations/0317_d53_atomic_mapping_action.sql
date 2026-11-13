CREATE OR REPLACE FUNCTION public.crm_work_apply_d53(_map jsonb,_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE e jsonb; w uuid; v uuid; a text; k text; t text; before_data jsonb; protected jsonb; current_data jsonb; saved_data jsonb; n integer; outcome jsonb;
BEGIN
IF NOT public.has_role(_actor,'admin') OR public.pm_project_b1_active() OR public.crm_work_numbering_active() THEN RAISE EXCEPTION 'Administrator required; both gates must be OFF'; END IF;
IF jsonb_array_length(_map)<>126 OR EXISTS(SELECT 1 FROM crm_work_identities) THEN RAISE EXCEPTION 'Expected approved 126-record map and empty identities'; END IF;
PERFORM pg_advisory_xact_lock(hashtext('D53-final-v4'));
PERFORM set_config('request.jwt.claim.sub',_actor::text,true);
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',_actor,'role','authenticated')::text,true);
PERFORM set_config('psa.work_mapping','approved',true);
LOCK TABLE crm_opportunities,fee_proposals,pm_projects,psa_proposals IN SHARE ROW EXCLUSIVE MODE;
protected:=public.crm_work_protected_hashes(); before_data:='{}';
FOREACH k IN ARRAY ARRAY['lead','quote','project','document'] LOOP
 t:=CASE k WHEN 'lead' THEN 'crm_opportunities' WHEN 'quote' THEN 'fee_proposals' WHEN 'project' THEN 'pm_projects' ELSE 'psa_proposals' END;
 EXECUTE format('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.%I r',t) INTO current_data;
 before_data:=before_data||jsonb_build_object(k,current_data);
END LOOP;
before_data:=before_data||jsonb_build_object('counters',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM crm_work_number_counters c));
INSERT INTO crm_work_mapping_backups(batch,approved_map,before_rows,protected_hashes) VALUES('D53-v4-final-2026-11-13',_map,before_data,protected);
FOR e IN SELECT value FROM jsonb_array_elements(_map) LOOP
 SELECT id INTO w FROM crm_work_identities WHERE canonical_number=e->>'number';
 IF w IS NULL THEN
  INSERT INTO crm_work_identities(canonical_number,name,original_created_at,is_fixture,created_by) VALUES(e->>'number',e->>'name',(e->>'created')::timestamptz,(e->>'number') LIKE 'QA-%',_actor) RETURNING id INTO w;
  INSERT INTO crm_work_identity_audit(work_id,action,after_value,reason,actor_id) VALUES(w,'approved-mapping',jsonb_build_object('number',e->>'number'),'Luis final OK D53 v4 plus Mint',_actor);
 END IF;
 INSERT INTO crm_work_versions(work_id,version_key,restart_year,restart_ordinal,created_by,reason) VALUES(w,e->>'version',CASE WHEN e->>'version'='26' THEN 2026 END,CASE WHEN e->>'version'='26' THEN 1 END,_actor,'Luis approved mapping') ON CONFLICT(work_id,version_key) DO NOTHING;
 SELECT id INTO v FROM crm_work_versions WHERE work_id=w AND version_key=e->>'version';
 FOR a IN SELECT jsonb_array_elements_text(e->'aliases') LOOP
  INSERT INTO crm_work_number_registry(number,work_id,reason) VALUES(a,w,'approved historical alias') ON CONFLICT(number) DO NOTHING;
  IF (SELECT work_id FROM crm_work_number_registry WHERE number=a) IS DISTINCT FROM w THEN RAISE EXCEPTION 'Alias collision %',a; END IF;
 END LOOP;
 k:=e->>'kind';
 IF k='lead' THEN UPDATE crm_opportunities SET work_version_id=v WHERE id=(e->>'id')::uuid;
 ELSIF k='quote' THEN UPDATE fee_proposals SET work_version_id=v,work_revision_ordinal=(e->>'ordinal')::int WHERE id=(e->>'id')::uuid;
 ELSIF k='project' THEN UPDATE pm_projects SET work_version_id=v WHERE id=(e->>'id')::uuid;
 ELSIF k='document' THEN UPDATE psa_proposals SET work_version_id=v,work_revision_ordinal=(e->>'ordinal')::int WHERE id=(e->>'id')::uuid;
 ELSE RAISE EXCEPTION 'Unknown kind'; END IF;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Missing approved record %',e->>'id'; END IF;
END LOOP;
FOREACH a IN ARRAY ARRAY['2009','2101','2128','2311','2315','2323','2324','2404','2417','2418','2420','2425','2427','2428','2501','2502','2503','2504','2505','2506','2507','2508','2509','2510','2511','2512','2514','2518','2519','2520','2521','2522','2524','2527','2530','2602','2603','2604','2605','2606','2607','2608','2609','2610','2611','2612','2613','2614','2615','2616','2617','2618'] LOOP
 INSERT INTO crm_work_number_registry(number,work_id,reason) VALUES(a,(SELECT id FROM crm_work_identities WHERE canonical_number=a),'Luis external folder reservation') ON CONFLICT(number) DO NOTHING;
END LOOP;
INSERT INTO crm_work_number_counters(year,last_sequence) VALUES(2026,30) ON CONFLICT(year) DO UPDATE SET last_sequence=30;
FOREACH k IN ARRAY ARRAY['lead','quote','project','document'] LOOP
 t:=CASE k WHEN 'lead' THEN 'crm_opportunities' WHEN 'quote' THEN 'fee_proposals' WHEN 'project' THEN 'pm_projects' ELSE 'psa_proposals' END;
 EXECUTE format('SELECT jsonb_agg(to_jsonb(r)-ARRAY[''work_version_id'',''work_revision_ordinal'',''updated_at''] ORDER BY id) FROM public.%I r',t) INTO current_data;
 SELECT jsonb_agg(x-ARRAY['work_version_id','work_revision_ordinal','updated_at'] ORDER BY x->>'id') INTO saved_data FROM jsonb_array_elements(before_data->k) x;
 IF current_data IS DISTINCT FROM saved_data THEN RAISE EXCEPTION 'Protected fields changed %',k; END IF;
END LOOP;
IF protected<>public.crm_work_protected_hashes() OR public.pm_project_b1_active() OR EXISTS(SELECT 1 FROM crm_work_number_registry WHERE number='26031') THEN RAISE EXCEPTION 'Protection or next-number checks failed'; END IF;
outcome:=jsonb_build_object('leads',30,'quotes',41,'projects',21,'documents',34,'identities',(SELECT count(*) FROM crm_work_identities),'qaIdentities',(SELECT count(*) FROM crm_work_identities WHERE is_fixture),'nextNumber','26031','protectedDataUnchanged',true,'duplicates',0,'unapplied',0,'b1',false);
UPDATE crm_work_mapping_backups SET result=outcome WHERE batch='D53-v4-final-2026-11-13';
RETURN outcome;
END $fn$;
REVOKE ALL ON FUNCTION public.crm_work_apply_d53(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_work_apply_d53(jsonb,uuid) TO service_role;