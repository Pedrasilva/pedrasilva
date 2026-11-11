-- Single-resource reads used by nested allocation projections follow the same project gate.
CREATE OR REPLACE FUNCTION public.pm_b1_resource(_resource uuid, _project uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RETURN NULL; END IF;
 IF _project IS NOT NULL THEN
   IF NOT public.pm_project_rate_access(_project) THEN RETURN NULL; END IF;
   SELECT x INTO r FROM public.pm_b1_financial_resources(_project,false) x WHERE x->>'id'=_resource::text;
   RETURN r;
 END IF;
 IF NOT public.pm_project_b1_active() THEN
   IF NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard')) THEN RETURN NULL; END IF;
   SELECT to_jsonb(x) INTO r FROM public.pm_resources x WHERE id=_resource;
   RETURN r;
 END IF;
 SELECT jsonb_build_object('id',id,'name',name,'full_name',full_name,'role',role,
 'billing_role',billing_role,'proposal_role',proposal_role,'color',color,'active',active,
 'team',team,'collaborator_id',collaborator_id,'weekly_capacity',weekly_capacity,
 'hourly_rate_is_override',hourly_rate_is_override,'created_at',created_at,'updated_at',updated_at,
 'hourly_rate',hourly_rate,'sale_rate',sale_rate,'cost_rate',cost_rate)
 INTO r FROM public.pm_resources WHERE id=_resource;
 IF public.pm_b1_global_financial_access() THEN RETURN r; END IF;
 RETURN public.pm_b1_redact(r,NULL,'resource');
END $$;