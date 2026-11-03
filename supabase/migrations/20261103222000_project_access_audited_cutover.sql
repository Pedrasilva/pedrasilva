CREATE TABLE public.pm_project_access_cutover_audit (
 revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL, before_active boolean NOT NULL, after_active boolean NOT NULL,
 before_matrix jsonb NOT NULL, after_matrix jsonb NOT NULL
);
GRANT SELECT ON public.pm_project_access_cutover_audit TO authenticated;
GRANT ALL ON public.pm_project_access_cutover_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pm_project_access_cutover_audit_revision_seq TO service_role;
REVOKE TRUNCATE ON public.pm_project_access_cutover_audit FROM anon,authenticated;
ALTER TABLE public.pm_project_access_cutover_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY cutover_audit_admin_read ON public.pm_project_access_cutover_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.pm_cutover_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Project cutover audit is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER cutover_audit_immutable BEFORE UPDATE OR DELETE ON public.pm_project_access_cutover_audit FOR EACH ROW EXECUTE FUNCTION public.pm_cutover_audit_immutable();
CREATE OR REPLACE FUNCTION public.pm_project_access_cutover_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT after_active FROM public.pm_project_access_cutover_audit ORDER BY revision DESC LIMIT 1),false) $$;
CREATE FUNCTION public.pm_change_project_access_cutover(_enabled boolean,_expected boolean,_matrix_hash text,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_before jsonb; v_after jsonb; v_active boolean; v_revision bigint;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))=0 OR _enabled IS NULL OR _expected IS NULL THEN RAISE EXCEPTION 'Explicit cutover state and reason required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pm.project.access.cutover',0));
 v_active:=public.pm_project_access_cutover_active();
 IF v_active IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'Cutover state changed; reload before saving'; END IF;
 v_before:=jsonb_set(public.pm_project_access_matrix(),'{active}',to_jsonb(v_active));
 IF md5((v_before->'rows')::text) IS DISTINCT FROM _matrix_hash THEN RAISE EXCEPTION 'Access matrix changed; review before cutover'; END IF;
 v_after:=jsonb_set(v_before,'{active}',to_jsonb(_enabled));
 INSERT INTO public.pm_project_access_cutover_audit(actor,reason,before_active,after_active,before_matrix,after_matrix) VALUES(auth.uid(),_reason,v_active,_enabled,v_before,v_after) RETURNING revision INTO v_revision;
 RETURN jsonb_build_object('revision',v_revision,'before',v_before,'after',v_after,'active',public.pm_project_access_cutover_active(),'matrix_hash',md5((v_before->'rows')::text));
END $$;
REVOKE ALL ON FUNCTION public.pm_change_project_access_cutover(boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_change_project_access_cutover(boolean,boolean,text,text) TO authenticated;
COMMENT ON FUNCTION public.pm_change_project_access_cutover(boolean,boolean,text,text) IS 'Admin-only matrix-checked cutover and immediate rollback; changes authorization state and append-only audit only, never project data.';