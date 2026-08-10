-- pm_stages
DROP POLICY IF EXISTS "Admins insert pm_stages" ON public.pm_stages;
CREATE POLICY "Authorized insert pm_stages" ON public.pm_stages
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
    AND project_id IS NOT NULL
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
);

DROP POLICY IF EXISTS "Admins update pm_stages" ON public.pm_stages;
CREATE POLICY "Authorized update pm_stages" ON public.pm_stages
FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
    AND project_id IS NOT NULL
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
    AND project_id IS NOT NULL
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
);

DROP POLICY IF EXISTS "Admins delete pm_stages" ON public.pm_stages;
CREATE POLICY "Authorized delete pm_stages" ON public.pm_stages
FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
    AND project_id IS NOT NULL
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
);

-- pm_allocations
DROP POLICY IF EXISTS "Admins insert pm_allocations" ON public.pm_allocations;
CREATE POLICY "Authorized insert pm_allocations" ON public.pm_allocations
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_allocations.stage_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);

DROP POLICY IF EXISTS "Admins update pm_allocations" ON public.pm_allocations;
CREATE POLICY "Authorized update pm_allocations" ON public.pm_allocations
FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_allocations.stage_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_allocations.stage_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);

DROP POLICY IF EXISTS "Admins delete pm_allocations" ON public.pm_allocations;
CREATE POLICY "Authorized delete pm_allocations" ON public.pm_allocations
FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_planning', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_allocations.stage_id
      AND has_module_permission(auth.uid(), 'projects.edit_planning', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);

-- pm_stage_dependencies
DROP POLICY IF EXISTS "Admins insert pm_stage_dependencies" ON public.pm_stage_dependencies;
CREATE POLICY "Authorized insert pm_stage_dependencies" ON public.pm_stage_dependencies
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_stage_dependencies.predecessor_id
      AND has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);

DROP POLICY IF EXISTS "Admins update pm_stage_dependencies" ON public.pm_stage_dependencies;
CREATE POLICY "Authorized update pm_stage_dependencies" ON public.pm_stage_dependencies
FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_stage_dependencies.predecessor_id
      AND has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_stage_dependencies.predecessor_id
      AND has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);

DROP POLICY IF EXISTS "Admins delete pm_stage_dependencies" ON public.pm_stage_dependencies;
CREATE POLICY "Authorized delete pm_stage_dependencies" ON public.pm_stage_dependencies
FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.edit_stages', 'all')
  OR EXISTS (
    SELECT 1 FROM public.pm_stages s
    WHERE s.id = pm_stage_dependencies.predecessor_id
      AND has_module_permission(auth.uid(), 'projects.edit_stages', 'assigned')
      AND pm_has_assigned_access(auth.uid(), s.project_id)
  )
);