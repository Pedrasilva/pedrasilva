-- B1 global resource reads use the existing audited capability, not a NULL project grant.
CREATE OR REPLACE FUNCTION public.pm_b1_global_financial_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_psa_staff() AND
    (public.has_role(auth.uid(),'admin') OR EXISTS(
      SELECT 1 FROM public.pm_global_financial_capabilities
      WHERE user_id=auth.uid() AND enabled));
$$;
REVOKE ALL ON FUNCTION public.pm_b1_global_financial_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_b1_global_financial_access() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pm_b1_resource(_resource uuid, _project uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_psa_staff() THEN RETURN NULL; END IF;
  IF NOT public.pm_project_b1_active() THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard')) THEN RETURN NULL; END IF;
    SELECT to_jsonb(x) INTO r FROM public.pm_resources x WHERE id=_resource;
    RETURN r;
  END IF;
  IF _project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pm_projects p
    WHERE p.id=_project AND NOT p.finance_only AND
      (public.has_role(auth.uid(),'admin') OR public.pm_can_view_projects(auth.uid()) OR public.pm_has_assigned_access(auth.uid(),p.id))) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('id',id,'name',name,'full_name',full_name,'role',role,
    'billing_role',billing_role,'proposal_role',proposal_role,'color',color,'active',active,
    'team',team,'collaborator_id',collaborator_id,'weekly_capacity',weekly_capacity,
    'hourly_rate_is_override',hourly_rate_is_override,'created_at',created_at,'updated_at',updated_at,
    'hourly_rate',hourly_rate,'sale_rate',sale_rate,'cost_rate',cost_rate)
    INTO r FROM public.pm_resources WHERE id=_resource;
  IF _project IS NULL AND public.pm_b1_global_financial_access() THEN RETURN r; END IF;
  RETURN public.pm_b1_redact(r,_project,'resource');
END $$;
CREATE OR REPLACE FUNCTION public.pm_b1_global_resources() RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.pm_project_b1_active() OR NOT public.pm_b1_global_financial_access() THEN RETURN; END IF;
  RETURN QUERY SELECT public.pm_b1_resource(r.id,NULL) FROM public.pm_resources r ORDER BY r.name,r.id;
END $$;
REVOKE ALL ON FUNCTION public.pm_b1_global_resources() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_b1_global_resources() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pm_b1_resources(_project uuid DEFAULT NULL) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF public.pm_project_b1_active() AND _project IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.pm_b1_financial_resources(_project,false);
  ELSIF public.pm_project_b1_active() AND public.pm_b1_global_financial_access() THEN
    RETURN QUERY SELECT * FROM public.pm_b1_global_resources();
  ELSE
    RETURN QUERY SELECT public.pm_b1_resource(r.id,_project) FROM public.pm_resources_public r ORDER BY r.name,r.id;
  END IF;
END $$;
COMMENT ON FUNCTION public.pm_b1_global_financial_access() IS 'Caller-only B1 global resource/rate access: PSA staff with admin or existing audited all-project financial capability; does not grant writes, Finance, or entity access.';