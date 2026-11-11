-- Derived resource costs include overheads; raw HR records and their policies are unchanged.
CREATE OR REPLACE FUNCTION public.pm_project_rate_access(_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.is_psa_staff() AND _project IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.pm_projects WHERE id=_project AND NOT finance_only)
 AND public.can_view_project_area(_project,'financials');
$$;
REVOKE ALL ON FUNCTION public.pm_project_rate_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_project_rate_access(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pm_b1_financial_resources(_project uuid, _preview boolean DEFAULT false)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.pm_project_rate_access(_project) THEN RETURN; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',id,'name',name,'full_name',full_name,'role',role,
 'billing_role',billing_role,'proposal_role',proposal_role,'color',color,'active',active,
 'team',team,'collaborator_id',collaborator_id,'weekly_capacity',weekly_capacity,
 'hourly_rate_is_override',hourly_rate_is_override,'created_at',created_at,'updated_at',updated_at,
 'hourly_rate',hourly_rate,'sale_rate',sale_rate,'cost_rate',cost_rate)
 FROM public.pm_resources ORDER BY name,id;
END $$;
CREATE OR REPLACE FUNCTION public.pm_b1_resources(_project uuid DEFAULT NULL) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF _project IS NOT NULL THEN
   RETURN QUERY SELECT * FROM public.pm_b1_financial_resources(_project,false);
 ELSIF public.pm_project_b1_active() AND public.pm_b1_global_financial_access() THEN
   RETURN QUERY SELECT * FROM public.pm_b1_global_resources();
 ELSE
   RETURN QUERY SELECT public.pm_b1_resource(r.id,NULL) FROM public.pm_resources_public r ORDER BY r.name,r.id;
 END IF;
END $$;
COMMENT ON FUNCTION public.pm_b1_financial_resources(uuid,boolean) IS 'Project Financials authorizes the same resource/rate projection in OFF and ON; no raw HR fields, no gate changes. Legacy preview flag never bypasses authorization.';