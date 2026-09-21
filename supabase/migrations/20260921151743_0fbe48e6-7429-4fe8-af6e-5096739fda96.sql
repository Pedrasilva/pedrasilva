DROP POLICY IF EXISTS "Admins update pm_projects" ON public.pm_projects;
CREATE POLICY "Authorized update pm_projects" ON public.pm_projects
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'projects.all'::text)
  OR has_permission(auth.uid(), 'projects.edit_planning'::text)
  OR has_permission(auth.uid(), 'projects.edit_stages'::text)
  OR has_module_permission(auth.uid(), 'projects.edit_stages'::text, 'all'::text)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'projects.all'::text)
  OR has_permission(auth.uid(), 'projects.edit_planning'::text)
  OR has_permission(auth.uid(), 'projects.edit_stages'::text)
  OR has_module_permission(auth.uid(), 'projects.edit_stages'::text, 'all'::text)
);