CREATE OR REPLACE VIEW public.marketing_project_directory WITH (security_invoker=true) AS
SELECT coalesce(p.marketing_key,pr.id) id,pr.name,pr.client,p.id profile_id,false portfolio,pr.id live_project_id FROM public.pm_projects pr LEFT JOIN public.marketing_project_profiles p ON p.project_id=pr.id
UNION ALL SELECT p.marketing_key,p.internal_name,p.internal_client,p.id,true,NULL::uuid FROM public.marketing_project_profiles p WHERE p.project_id IS NULL;
GRANT SELECT ON public.marketing_project_directory TO authenticated,service_role;
ALTER FUNCTION public.marketing_capture_key(public.marketing_captures) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.marketing_capture_key(public.marketing_captures) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_capture_key(public.marketing_captures) TO authenticated,service_role;