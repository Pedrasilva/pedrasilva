ALTER TABLE public.psa_proposals ADD COLUMN work_version_id uuid REFERENCES public.crm_work_versions(id), ADD COLUMN work_revision_ordinal integer;
CREATE TABLE public.crm_work_mapping_backups (batch text PRIMARY KEY, approved_map jsonb NOT NULL, before_rows jsonb NOT NULL, protected_hashes jsonb NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.crm_work_mapping_backups TO service_role;
REVOKE ALL ON public.crm_work_mapping_backups FROM anon,authenticated;
REVOKE TRUNCATE ON public.crm_work_mapping_backups FROM anon,authenticated;
ALTER TABLE public.crm_work_mapping_backups ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.crm_work_mapping_backups IS 'D53 service-only before-images and verification for reversible approved identity mapping; never contains changed commercial data.';
ALTER TABLE public.crm_work_identities ADD CONSTRAINT crm_work_fixture_format_v2 CHECK ((is_fixture AND canonical_number ~ '^QA-[0-9]{3}$') OR (NOT is_fixture AND canonical_number ~ '^[0-9]{4,5}[A-Z]?$')) NOT VALID;
ALTER TABLE public.crm_work_identities DROP CONSTRAINT crm_work_number_format;
ALTER TABLE public.crm_work_identities VALIDATE CONSTRAINT crm_work_fixture_format_v2;
CREATE OR REPLACE FUNCTION public.crm_work_protected_hashes() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb:='{}'; item record; val text; BEGIN
FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'crm_work_%' AND tablename NOT IN ('crm_opportunities','fee_proposals','pm_projects','psa_proposals') LOOP
EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'''' ORDER BY to_jsonb(r)::text),'''')) FROM public.%I r',item.tablename) INTO val;
result:=result||jsonb_build_object(item.tablename,val); END LOOP; RETURN result; END $$;
REVOKE ALL ON FUNCTION public.crm_work_protected_hashes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_work_protected_hashes() TO service_role;
COMMENT ON COLUMN public.psa_proposals.work_version_id IS 'Live rendering identity, independent of immutable project_snapshot and quote ownership.';
CREATE OR REPLACE FUNCTION public.crm_work_document_reference(_document uuid) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT public.crm_work_reference(p.work_version_id,coalesce(p.work_revision_ordinal,0)) FROM public.psa_proposals p WHERE p.id=_document $$;
REVOKE ALL ON FUNCTION public.crm_work_document_reference(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_work_document_reference(uuid) TO authenticated,service_role;
DO $patch$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.crm_work_numbering_fixture_check(uuid)'::regprocedure) INTO d;
d:=replace(d,'''99''||lpad','''QA-''||lpad'); d:=replace(d,'''99123''','''QA-998'''); EXECUTE d;
END $patch$;