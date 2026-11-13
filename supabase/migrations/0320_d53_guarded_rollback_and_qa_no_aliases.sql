CREATE OR REPLACE FUNCTION public.crm_work_rollback_d53(_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b crm_work_mapping_backups; k text; t text; cur jsonb; saved jsonb;
BEGIN
IF NOT public.has_role(_actor,'admin') OR public.pm_project_b1_active() THEN RAISE EXCEPTION 'Administrator and B1 OFF required'; END IF;
PERFORM pg_advisory_xact_lock(hashtext('D53-final-v4'));
LOCK TABLE crm_opportunities,fee_proposals,pm_projects,psa_proposals,crm_work_number_counters IN SHARE ROW EXCLUSIVE MODE;
SELECT * INTO b FROM crm_work_mapping_backups WHERE batch='D53-v4-final-2026-11-13'; IF b.batch IS NULL THEN RAISE EXCEPTION 'Missing backup'; END IF;
FOREACH k IN ARRAY ARRAY['lead','quote','project','document'] LOOP
 t:=CASE k WHEN 'lead' THEN 'crm_opportunities' WHEN 'quote' THEN 'fee_proposals' WHEN 'project' THEN 'pm_projects' ELSE 'psa_proposals' END;
 EXECUTE format('SELECT jsonb_agg(to_jsonb(r)-ARRAY[''work_version_id'',''work_revision_ordinal'',''updated_at''] ORDER BY id) FROM public.%I r',t) INTO cur;
 SELECT jsonb_agg(x-ARRAY['work_version_id','work_revision_ordinal','updated_at'] ORDER BY x->>'id') INTO saved FROM jsonb_array_elements(b.before_rows->k) x;
 IF cur IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Later changes detected; scoped review required %',k; END IF;
END LOOP;
IF (SELECT last_sequence FROM crm_work_number_counters WHERE year=2026)<>30 THEN RAISE EXCEPTION 'New numbers allocated; scoped rollback required'; END IF;
PERFORM set_config('request.jwt.claim.sub',_actor::text,true); PERFORM set_config('psa.work_mapping','approved',true);
UPDATE crm_work_numbering_gate SET active=false WHERE singleton;
FOREACH k IN ARRAY ARRAY['lead','quote','project','document'] LOOP
 t:=CASE k WHEN 'lead' THEN 'crm_opportunities' WHEN 'quote' THEN 'fee_proposals' WHEN 'project' THEN 'pm_projects' ELSE 'psa_proposals' END;
 IF k IN ('quote','document') THEN
 EXECUTE format('UPDATE public.%I r SET work_version_id=(x->>''work_version_id'')::uuid,work_revision_ordinal=(x->>''work_revision_ordinal'')::int FROM jsonb_array_elements($1) x WHERE r.id=(x->>''id'')::uuid',t) USING b.before_rows->k;
 ELSE EXECUTE format('UPDATE public.%I r SET work_version_id=(x->>''work_version_id'')::uuid FROM jsonb_array_elements($1) x WHERE r.id=(x->>''id'')::uuid',t) USING b.before_rows->k;
 END IF;
END LOOP;
INSERT INTO crm_work_identity_audit(work_id,action,after_value,reason,actor_id) SELECT id,'mapping-rollback',jsonb_build_object('linked',false),'Guarded D53 rollback; identities and reservations preserved',_actor FROM crm_work_identities;
RETURN jsonb_build_object('numberingActive',false,'deleted',0,'b1',false);
END $fn$;
REVOKE ALL ON FUNCTION public.crm_work_rollback_d53(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_work_rollback_d53(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.crm_work_qa_alias_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF EXISTS(SELECT 1 FROM crm_work_identities WHERE id=NEW.work_id AND is_fixture AND canonical_number<>NEW.number) THEN RAISE EXCEPTION 'QA identities cannot hold aliases'; END IF; RETURN NEW; END $$;
CREATE TRIGGER crm_work_qa_alias_guard BEFORE INSERT OR UPDATE ON public.crm_work_number_registry FOR EACH ROW EXECUTE FUNCTION public.crm_work_qa_alias_guard();