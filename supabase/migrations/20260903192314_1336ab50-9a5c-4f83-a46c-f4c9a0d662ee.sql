CREATE POLICY "Planners insert pm_tasks" ON public.pm_tasks FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_allocations a
    JOIN public.pm_stages s ON s.id = a.stage_id
    WHERE a.id = pm_tasks.allocation_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);

CREATE POLICY "Planners update pm_tasks" ON public.pm_tasks FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_allocations a
    JOIN public.pm_stages s ON s.id = a.stage_id
    WHERE a.id = pm_tasks.allocation_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_allocations a
    JOIN public.pm_stages s ON s.id = a.stage_id
    WHERE a.id = pm_tasks.allocation_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);

CREATE POLICY "Planners delete pm_tasks" ON public.pm_tasks FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_allocations a
    JOIN public.pm_stages s ON s.id = a.stage_id
    WHERE a.id = pm_tasks.allocation_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);