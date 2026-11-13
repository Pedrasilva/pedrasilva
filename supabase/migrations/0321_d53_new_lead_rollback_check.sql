CREATE OR REPLACE FUNCTION public.crm_work_d53_creation_check(_actor uuid,_source uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE src crm_opportunities; test_id uuid:=gen_random_uuid(); version_id uuid; ref text; result jsonb; counter_before int; gate_before boolean;
BEGIN
IF NOT public.has_role(_actor,'admin') OR public.pm_project_b1_active() THEN RAISE EXCEPTION 'Administrator and B1 OFF required'; END IF;
PERFORM set_config('request.jwt.claim.sub',_actor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',_actor,'role','authenticated')::text,true);
SELECT * INTO src FROM crm_opportunities WHERE id=_source; IF src.id IS NULL THEN RAISE EXCEPTION 'Missing source'; END IF;
SELECT last_sequence INTO counter_before FROM crm_work_number_counters WHERE year=2026;gate_before:=public.crm_work_numbering_active();
BEGIN
UPDATE crm_work_numbering_gate SET active=true WHERE singleton;
IF NOT FOUND THEN INSERT INTO crm_work_numbering_gate(singleton,active,mapping_hash,activated_by) VALUES(true,true,'QA transaction rollback only',_actor); END IF;
INSERT INTO crm_opportunities SELECT * FROM jsonb_populate_record(NULL::crm_opportunities,to_jsonb(src)||jsonb_build_object('id',test_id,'name','[QA DISPOSABLE] D53 creation rollback','created_at',now(),'updated_at',now(),'work_version_id',NULL,'primary_contact_id',NULL,'company_id',NULL,'account_id',NULL,'project_id',NULL,'stage','lead'));
SELECT work_version_id INTO version_id FROM crm_opportunities WHERE id=test_id;
ref:=public.crm_work_reference(version_id,0);IF ref<>'26031' THEN RAISE EXCEPTION 'Expected next 26031, got %',ref;END IF;
result:=jsonb_build_object('nextLeadNumber',ref,'separateFixture',true,'rolledBack',true);
RAISE EXCEPTION 'D53 test rollback' USING ERRCODE='ZD053';
EXCEPTION WHEN SQLSTATE 'ZD053' THEN NULL;END;
IF EXISTS(SELECT 1 FROM crm_opportunities WHERE id=test_id) OR (SELECT last_sequence FROM crm_work_number_counters WHERE year=2026)<>counter_before OR public.crm_work_numbering_active()<>gate_before THEN RAISE EXCEPTION 'Fixture rollback failed';END IF;
RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.crm_work_d53_creation_check(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_work_d53_creation_check(uuid,uuid) TO service_role;