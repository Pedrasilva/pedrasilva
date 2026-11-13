CREATE OR REPLACE FUNCTION public.crm_work_activate_d53(_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b crm_work_mapping_backups; e jsonb; actual text; expected text; k text; t text; cur jsonb; saved jsonb; ordinal_sql text;
BEGIN
IF NOT public.has_role(_actor,'admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
PERFORM pg_advisory_xact_lock(hashtext('D53-final-v4'));
LOCK TABLE crm_opportunities,fee_proposals,pm_projects,psa_proposals,crm_work_number_counters IN SHARE ROW EXCLUSIVE MODE;
SELECT * INTO b FROM crm_work_mapping_backups WHERE batch='D53-v4-final-2026-11-13'; IF b.batch IS NULL THEN RAISE EXCEPTION 'Missing backup'; END IF;
FOREACH k IN ARRAY ARRAY['lead','quote','project','document'] LOOP
 t:=CASE k WHEN 'lead' THEN 'crm_opportunities' WHEN 'quote' THEN 'fee_proposals' WHEN 'project' THEN 'pm_projects' ELSE 'psa_proposals' END;
 EXECUTE format('SELECT jsonb_agg(to_jsonb(r)-ARRAY[''work_version_id'',''work_revision_ordinal'',''updated_at''] ORDER BY id) FROM public.%I r',t) INTO cur;
 SELECT jsonb_agg(x-ARRAY['work_version_id','work_revision_ordinal','updated_at'] ORDER BY x->>'id') INTO saved FROM jsonb_array_elements(b.before_rows->k) x;
 IF cur IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Protected record change %',k; END IF;
END LOOP;
FOR e IN SELECT value FROM jsonb_array_elements(b.approved_map) LOOP
 k:=e->>'kind';t:=CASE k WHEN 'lead' THEN 'crm_opportunities' WHEN 'quote' THEN 'fee_proposals' WHEN 'project' THEN 'pm_projects' ELSE 'psa_proposals' END;
 ordinal_sql:=CASE WHEN k IN ('quote','document') THEN 'work_revision_ordinal' ELSE '0' END;
 EXECUTE format('SELECT public.crm_work_reference(work_version_id,%s) FROM public.%I WHERE id=$1',ordinal_sql,t) INTO actual USING (e->>'id')::uuid;
 expected:=(e->>'number'); IF e->>'version'<>'' THEN expected:=expected||'-'||(e->>'version'); END IF; expected:=expected||public.crm_work_letters((e->>'ordinal')::int);
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Mapping mismatch %',e->>'id'; END IF;
END LOOP;
IF b.protected_hashes<>public.crm_work_protected_hashes() OR public.pm_project_b1_active() OR EXISTS(SELECT 1 FROM crm_work_number_registry WHERE number='26031') OR (SELECT last_sequence FROM crm_work_number_counters WHERE year=2026)<>30 OR EXISTS(SELECT canonical_number FROM crm_work_identities GROUP BY canonical_number HAVING count(*)>1) THEN RAISE EXCEPTION 'Final verification failed'; END IF;
INSERT INTO crm_work_numbering_gate(singleton,active,mapping_hash,activated_by) VALUES(true,true,md5(b.approved_map::text),_actor) ON CONFLICT(singleton) DO UPDATE SET active=true,mapping_hash=excluded.mapping_hash,activated_by=_actor,activated_at=now();
RETURN b.result||jsonb_build_object('numberingActive',true);
END $fn$;
REVOKE ALL ON FUNCTION public.crm_work_activate_d53(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_work_activate_d53(uuid) TO service_role;