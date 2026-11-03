CREATE OR REPLACE FUNCTION public.pm_project_access_matrix()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rows jsonb; v_conflicts jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('user_id',u.id,'person',coalesce(c.nome,u.email),'project_id',p.id,'project',p.name,'area',a.area,
 'current_invoice_access',public.has_role(u.id,'admin') OR (c.id IS NOT NULL AND (public.has_module_permission(u.id,'projects.view_financials','all') OR
 (public.has_module_permission(u.id,'projects.view_financials','assigned') AND public.pm_has_assigned_access(u.id,p.id)) OR public.has_permission(u.id,'finance.dashboard'))),
 'legacy_financial_access',public.pm_can_see_project_financials(u.id),'proposed_access',public.pm_project_area_proposed(p.id,a.area,u.id)))
 INTO v_rows FROM auth.users u LEFT JOIN LATERAL (SELECT id,nome FROM public.collaborators WHERE lower(email)=lower(u.email) AND archived_at IS NULL LIMIT 1) c ON true
 CROSS JOIN public.pm_projects p CROSS JOIN (VALUES('financials'),('budget_cost'),('expenses'),('supplier_fees')) a(area);
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO v_conflicts FROM (SELECT p.id,p.name,count(DISTINCT t.resource_id) AS managers,jsonb_agg(r.name) AS people FROM public.pm_project_team t JOIN public.pm_projects p ON p.id=t.project_id JOIN public.pm_resources r ON r.id=t.resource_id WHERE t.role='manager' GROUP BY p.id,p.name HAVING count(DISTINCT t.resource_id)>1) x;
 RETURN jsonb_build_object('active',false,'rows',coalesce(v_rows,'[]'),'manager_conflicts',v_conflicts,'note','Current invoice/legacy predicates are shown separately; entity-context policies and mixed-table overexposure require separate verification. No cutover applied.');
END $$;