CREATE TABLE public.pm_project_person_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
 resource_id uuid NOT NULL REFERENCES public.pm_resources(id), financials boolean NOT NULL DEFAULT false,
 budget_cost boolean NOT NULL DEFAULT false, expenses boolean NOT NULL DEFAULT false, supplier_fees boolean NOT NULL DEFAULT false,
 provenance text NOT NULL, revision integer NOT NULL DEFAULT 1, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL, UNIQUE(project_id,resource_id)
);
GRANT SELECT ON public.pm_project_person_access TO authenticated;
GRANT ALL ON public.pm_project_person_access TO service_role;
REVOKE TRUNCATE ON public.pm_project_person_access FROM anon,authenticated;
ALTER TABLE public.pm_project_person_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY staged_project_access_read ON public.pm_project_person_access FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') OR resource_id=public.pm_unique_viewer_resource());
CREATE TABLE public.pm_project_access_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
 resource_id uuid NOT NULL, actor uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL,
 action text NOT NULL, before_values jsonb, after_values jsonb
);
GRANT SELECT ON public.pm_project_access_audit TO authenticated;
GRANT ALL ON public.pm_project_access_audit TO service_role;
REVOKE TRUNCATE ON public.pm_project_access_audit FROM anon,authenticated;
ALTER TABLE public.pm_project_access_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_access_audit_admin_read ON public.pm_project_access_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.pm_project_access_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM public.pm_projects WHERE id=OLD.project_id) THEN RAISE EXCEPTION 'Project access audit is append-only' USING ERRCODE='42501'; END IF; RETURN OLD; END $$;
CREATE TRIGGER project_access_audit_immutable BEFORE UPDATE OR DELETE ON public.pm_project_access_audit FOR EACH ROW EXECUTE FUNCTION public.pm_project_access_audit_immutable();
CREATE OR REPLACE FUNCTION public.pm_project_access_cutover_active()
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT false $$;
COMMENT ON FUNCTION public.pm_project_access_cutover_active() IS 'Separate owner matrix approval required before changing this gate. Phase A staging does not activate financial restrictions.';
CREATE OR REPLACE FUNCTION public.pm_project_area_proposed(_project uuid,_area text,_user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_resource uuid; v_count integer; v_allowed boolean;
BEGIN
 IF _area NOT IN ('financials','budget_cost','expenses','supplier_fees') OR _user IS NULL THEN RETURN false; END IF;
 IF public.has_role(_user,'admin') THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.collaborators c JOIN auth.users u ON lower(c.email)=lower(u.email) WHERE u.id=_user AND c.archived_at IS NULL) THEN RETURN false; END IF;
 IF public.has_module_permission(_user,'finance.dashboard','all') THEN RETURN true; END IF;
 SELECT count(*),(array_agg(r.id))[1] INTO v_count,v_resource FROM public.pm_resources r JOIN auth.users u ON u.id=_user
 WHERE lower(r.email)=lower(u.email) OR r.collaborator_id IN (SELECT id FROM public.collaborators c WHERE lower(c.email)=lower(u.email) AND c.archived_at IS NULL);
 IF v_count<>1 THEN RETURN false; END IF;
 SELECT CASE _area WHEN 'financials' THEN financials WHEN 'budget_cost' THEN budget_cost WHEN 'expenses' THEN expenses ELSE supplier_fees END INTO v_allowed
 FROM public.pm_project_person_access WHERE project_id=_project AND resource_id=v_resource;
 IF FOUND THEN RETURN v_allowed; END IF;
 RETURN _area='financials' AND EXISTS(SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND resource_id=v_resource AND role='manager');
END $$;
REVOKE ALL ON FUNCTION public.pm_project_area_proposed(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.can_view_project_area(_project uuid,_area text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.pm_project_access_cutover_active() THEN RETURN public.pm_can_read_incoming_dates(_project); END IF;
 RETURN public.pm_project_area_proposed(_project,_area,auth.uid());
END $$;
CREATE OR REPLACE FUNCTION public.pm_preview_project_access(_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rows jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('resource_id',r.id,'name',r.name,'roles',(SELECT jsonb_agg(role) FROM public.pm_project_team WHERE project_id=_project AND resource_id=r.id),
 'revision',coalesce(a.revision,0),'financials',coalesce(a.financials,EXISTS(SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND resource_id=r.id AND role='manager')),
 'budget_cost',coalesce(a.budget_cost,false),'expenses',coalesce(a.expenses,false),'supplier_fees',coalesce(a.supplier_fees,false),'provenance',coalesce(a.provenance,'proposed_role_default')) ORDER BY r.name),'[]') INTO v_rows
 FROM public.pm_resources r LEFT JOIN public.pm_project_person_access a ON a.resource_id=r.id AND a.project_id=_project
 WHERE a.id IS NOT NULL OR EXISTS(SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND resource_id=r.id);
 RETURN jsonb_build_object('active',public.pm_project_access_cutover_active(),'rows',v_rows);
END $$;
CREATE OR REPLACE FUNCTION public.pm_change_project_access(_project uuid,_resource uuid,_flags jsonb,_revision integer,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.pm_project_person_access; v_new public.pm_project_person_access;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_flags) k WHERE k NOT IN ('financials','budget_cost','expenses','supplier_fees')) THEN RAISE EXCEPTION 'Invalid project access area'; END IF;
 PERFORM 1 FROM public.pm_projects WHERE id=_project FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND resource_id=_resource) THEN RAISE EXCEPTION 'Project team membership required'; END IF;
 SELECT * INTO v_old FROM public.pm_project_person_access WHERE project_id=_project AND resource_id=_resource FOR UPDATE;
 IF coalesce(v_old.revision,0)<>_revision THEN RAISE EXCEPTION 'Project access changed; reload before saving'; END IF;
 INSERT INTO public.pm_project_person_access(project_id,resource_id,financials,budget_cost,expenses,supplier_fees,provenance,created_by,updated_by,reason)
 VALUES(_project,_resource,coalesce((_flags->>'financials')::boolean,v_old.financials,EXISTS(SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND resource_id=_resource AND role='manager')),
 coalesce((_flags->>'budget_cost')::boolean,v_old.budget_cost,false),coalesce((_flags->>'expenses')::boolean,v_old.expenses,false),coalesce((_flags->>'supplier_fees')::boolean,v_old.supplier_fees,false),'admin_proposed',auth.uid(),auth.uid(),_reason)
 ON CONFLICT(project_id,resource_id) DO UPDATE SET financials=EXCLUDED.financials,budget_cost=EXCLUDED.budget_cost,expenses=EXCLUDED.expenses,supplier_fees=EXCLUDED.supplier_fees,
 revision=pm_project_person_access.revision+1,updated_by=auth.uid(),updated_at=now(),reason=_reason,provenance='admin_proposed' RETURNING * INTO v_new;
 INSERT INTO public.pm_project_access_audit(project_id,resource_id,actor,reason,action,before_values,after_values) VALUES(_project,_resource,auth.uid(),_reason,'access_proposal',to_jsonb(v_old),to_jsonb(v_new));
 RETURN to_jsonb(v_new);
END $$;
CREATE OR REPLACE FUNCTION public.pm_team_admin_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_project uuid; v_resource uuid; v_reason text;
BEGIN
 v_project:=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END;
 v_resource:=CASE WHEN TG_OP='DELETE' THEN OLD.resource_id ELSE NEW.resource_id END;
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.pm_projects WHERE id=v_project) THEN RETURN OLD; END IF;
 IF NOT public.has_role(auth.uid(),'admin') OR coalesce(current_setting('pm.team_admin_action',true),'')<>'yes' THEN RAISE EXCEPTION 'Only an administrator may change project team roles through the audited action' USING ERRCODE='42501'; END IF;
 v_reason:=current_setting('pm.team_admin_reason',true);
 INSERT INTO public.pm_project_access_audit(project_id,resource_id,actor,reason,action,before_values,after_values)
 VALUES(v_project,v_resource,auth.uid(),v_reason,'team_'||lower(TG_OP),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER pm_team_admin_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pm_project_team FOR EACH ROW EXECUTE FUNCTION public.pm_team_admin_guard();
DROP POLICY team_write ON public.pm_project_team;
CREATE POLICY team_admin_write ON public.pm_project_team FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.pm_change_project_team(_project uuid,_resource uuid,_role public.pm_project_team_role,_remove boolean,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 PERFORM 1 FROM public.pm_projects WHERE id=_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
 IF NOT _remove AND _role='manager' AND EXISTS(SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND role='manager' AND resource_id<>_resource) THEN RAISE EXCEPTION 'Existing project manager conflict requires administrator review'; END IF;
 PERFORM set_config('pm.team_admin_action','yes',true); PERFORM set_config('pm.team_admin_reason',_reason,true);
 IF _remove THEN DELETE FROM public.pm_project_team WHERE project_id=_project AND resource_id=_resource AND role=_role;
 ELSE INSERT INTO public.pm_project_team(project_id,resource_id,role) VALUES(_project,_resource,_role) ON CONFLICT DO NOTHING;
 INSERT INTO public.pm_project_person_access(project_id,resource_id,financials,provenance,created_by,updated_by,reason)
 VALUES(_project,_resource,_role='manager','new_team_role_default',auth.uid(),auth.uid(),_reason) ON CONFLICT(project_id,resource_id) DO NOTHING;
 END IF;
 PERFORM set_config('pm.team_admin_action','',true); PERFORM set_config('pm.team_admin_reason','',true);
END $$;
CREATE OR REPLACE FUNCTION public.pm_project_access_matrix()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rows jsonb; v_conflicts jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('user_id',u.id,'person',coalesce(c.nome_completo,u.email),'project_id',p.id,'project',p.name,'area',a.area,
 'current_invoice_access',public.has_role(u.id,'admin') OR (c.id IS NOT NULL AND (public.has_module_permission(u.id,'projects.view_financials','all') OR
 (public.has_module_permission(u.id,'projects.view_financials','assigned') AND public.pm_has_assigned_access(u.id,p.id)) OR public.has_permission(u.id,'finance.dashboard'))),
 'legacy_financial_access',public.pm_can_see_project_financials(u.id),'proposed_access',public.pm_project_area_proposed(p.id,a.area,u.id)))
 INTO v_rows FROM auth.users u LEFT JOIN LATERAL (SELECT id,nome_completo FROM public.collaborators WHERE lower(email)=lower(u.email) AND archived_at IS NULL LIMIT 1) c ON true
 CROSS JOIN public.pm_projects p CROSS JOIN (VALUES('financials'),('budget_cost'),('expenses'),('supplier_fees')) a(area);
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO v_conflicts FROM (SELECT p.id,p.name,count(DISTINCT t.resource_id) AS managers,jsonb_agg(r.name) AS people FROM public.pm_project_team t JOIN public.pm_projects p ON p.id=t.project_id JOIN public.pm_resources r ON r.id=t.resource_id WHERE t.role='manager' GROUP BY p.id,p.name HAVING count(DISTINCT t.resource_id)>1) x;
 RETURN jsonb_build_object('active',false,'rows',coalesce(v_rows,'[]'),'manager_conflicts',v_conflicts,'note','Current invoice/legacy predicates are shown separately; entity-context policies and mixed-table overexposure require separate verification. No cutover applied.');
END $$;
REVOKE ALL ON FUNCTION public.can_view_project_area(uuid,text),public.pm_preview_project_access(uuid),public.pm_change_project_access(uuid,uuid,jsonb,integer,text),public.pm_change_project_team(uuid,uuid,public.pm_project_team_role,boolean,text),public.pm_project_access_matrix() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_view_project_area(uuid,text),public.pm_preview_project_access(uuid),public.pm_change_project_access(uuid,uuid,jsonb,integer,text),public.pm_change_project_team(uuid,uuid,public.pm_project_team_role,boolean,text),public.pm_project_access_matrix() TO authenticated,service_role;