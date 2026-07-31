CREATE OR REPLACE FUNCTION public.pm_can_view_projects(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_module_permission(_user_id, 'projects.view', 'own')
      OR public.has_permission(_user_id, 'projects.view');
$function$;

DROP POLICY IF EXISTS "Authorized read pm_stages" ON public.pm_stages;
CREATE POLICY "Authorized read pm_stages" ON public.pm_stages
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard'::text)
  OR has_permission(auth.uid(), 'projects.financials'::text)
  OR has_permission(auth.uid(), 'projects.all'::text)
  OR has_module_permission(auth.uid(), 'projects.view'::text, 'all'::text)
  OR (
    has_module_permission(auth.uid(), 'projects.view'::text, 'assigned'::text)
    AND project_id IS NOT NULL
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
);