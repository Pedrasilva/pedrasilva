CREATE TABLE public.pm_global_financial_capabilities (
 user_id uuid PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 assigned_by uuid NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL
);
GRANT SELECT ON public.pm_global_financial_capabilities TO authenticated;
GRANT ALL ON public.pm_global_financial_capabilities TO service_role;
REVOKE TRUNCATE ON public.pm_global_financial_capabilities FROM anon, authenticated;
ALTER TABLE public.pm_global_financial_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY global_capability_read ON public.pm_global_financial_capabilities FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR user_id=auth.uid());
CREATE TABLE public.pm_global_financial_capability_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, actor uuid NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL, before_values jsonb, after_values jsonb NOT NULL
);
GRANT SELECT ON public.pm_global_financial_capability_audit TO authenticated;
GRANT ALL ON public.pm_global_financial_capability_audit TO service_role;
REVOKE TRUNCATE ON public.pm_global_financial_capability_audit FROM anon, authenticated;
ALTER TABLE public.pm_global_financial_capability_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY global_capability_audit_read ON public.pm_global_financial_capability_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.pm_global_capability_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Global capability audit is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER global_capability_audit_immutable BEFORE UPDATE OR DELETE ON public.pm_global_financial_capability_audit FOR EACH ROW EXECUTE FUNCTION public.pm_global_capability_audit_immutable();
CREATE FUNCTION public.pm_change_global_financial_capability(_user uuid,_enabled boolean,_revision integer,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.pm_global_financial_capabilities; v_new public.pm_global_financial_capabilities;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pm.global.capability:'||_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.collaborators c ON lower(c.email)=lower(u.email) WHERE u.id=_user AND c.archived_at IS NULL) THEN RAISE EXCEPTION 'Active PSA collaborator required'; END IF;
 SELECT * INTO v_old FROM public.pm_global_financial_capabilities WHERE user_id=_user FOR UPDATE;
 IF coalesce(v_old.revision,0)<>_revision THEN RAISE EXCEPTION 'Project access changed; reload before saving'; END IF;
 INSERT INTO public.pm_global_financial_capabilities(user_id,enabled,assigned_by,reason) VALUES(_user,_enabled,auth.uid(),_reason)
 ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,revision=pm_global_financial_capabilities.revision+1,assigned_by=auth.uid(),assigned_at=now(),reason=_reason RETURNING * INTO v_new;
 INSERT INTO public.pm_global_financial_capability_audit(user_id,actor,reason,before_values,after_values) VALUES(_user,auth.uid(),_reason,to_jsonb(v_old),to_jsonb(v_new));
 RETURN to_jsonb(v_new);
END $$;
REVOKE ALL ON FUNCTION public.pm_change_global_financial_capability(uuid,boolean,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_change_global_financial_capability(uuid,boolean,integer,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pm_project_area_proposed(_project uuid,_area text,_user uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_resource uuid; v_count integer; v_allowed boolean;
BEGIN
 IF _area NOT IN ('financials','budget_cost','expenses','supplier_fees') OR _user IS NULL OR NOT EXISTS(SELECT 1 FROM public.pm_projects WHERE id=_project) THEN RETURN false; END IF;
 IF public.has_role(_user,'admin') THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.collaborators c JOIN auth.users u ON lower(c.email)=lower(u.email) WHERE u.id=_user AND c.archived_at IS NULL) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.pm_global_financial_capabilities WHERE user_id=_user AND enabled) THEN RETURN true; END IF;
 SELECT count(*),(array_agg(r.id))[1] INTO v_count,v_resource FROM public.pm_resources r JOIN auth.users u ON u.id=_user WHERE lower(r.email)=lower(u.email) OR r.collaborator_id IN (SELECT id FROM public.collaborators c WHERE lower(c.email)=lower(u.email) AND c.archived_at IS NULL);
 IF v_count<>1 THEN RETURN false; END IF;
 SELECT CASE _area WHEN 'financials' THEN financials WHEN 'budget_cost' THEN budget_cost WHEN 'expenses' THEN expenses ELSE supplier_fees END INTO v_allowed FROM public.pm_project_person_access WHERE project_id=_project AND resource_id=v_resource;
 IF FOUND THEN RETURN v_allowed; END IF;
 RETURN _area='financials' AND EXISTS(SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND resource_id=v_resource AND role='manager');
END $$;
COMMENT ON TABLE public.pm_global_financial_capabilities IS 'Explicit audited PSA project financial read capability, all four areas; effective only after separately approved project access cutover. Does not grant Finance writes or administration.';