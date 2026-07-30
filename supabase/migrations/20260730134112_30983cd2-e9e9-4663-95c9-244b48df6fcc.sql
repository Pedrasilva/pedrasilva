-- 1. financial_documents
DROP POLICY IF EXISTS findoc_read ON public.financial_documents;
CREATE POLICY findoc_read ON public.financial_documents FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard')
  OR has_module_permission(auth.uid(), 'finance.documents.view', 'all')
);

DROP POLICY IF EXISTS findoc_write ON public.financial_documents;
CREATE POLICY findoc_write ON public.financial_documents FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard')
  OR has_module_permission(auth.uid(), 'finance.documents.edit', 'all')
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard')
  OR has_module_permission(auth.uid(), 'finance.documents.edit', 'all')
);

-- 2. pm_projects
DROP POLICY IF EXISTS "Authorized read pm_projects" ON public.pm_projects;
CREATE POLICY "Authorized read pm_projects" ON public.pm_projects FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'finance.dashboard')
  OR has_permission(auth.uid(), 'projects.financials')
  OR has_permission(auth.uid(), 'projects.all')
  OR has_module_permission(auth.uid(), 'projects.view', 'all')
  OR (has_module_permission(auth.uid(), 'projects.view', 'assigned') AND pm_has_assigned_access(auth.uid(), id))
);

-- 3. pm_time_entries
DROP POLICY IF EXISTS "Users see own time entries + admins all" ON public.pm_time_entries;
CREATE POLICY "Users see own time entries + admins all" ON public.pm_time_entries FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR (has_module_permission(auth.uid(), 'timesheets.view_team', 'team') AND pm_has_team_access(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Approvers read all time entries" ON public.pm_time_entries;
CREATE POLICY "Approvers read all time entries" ON public.pm_time_entries FOR SELECT TO authenticated
USING (
  pm_can_approve_hours(auth.uid())
  OR (has_module_permission(auth.uid(), 'timesheets.approve', 'team') AND pm_has_team_access(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Approvers can update time entries" ON public.pm_time_entries;
CREATE POLICY "Approvers can update time entries" ON public.pm_time_entries FOR UPDATE TO authenticated
USING (
  pm_can_approve_hours(auth.uid())
  OR (has_module_permission(auth.uid(), 'timesheets.approve', 'team') AND pm_has_team_access(auth.uid(), user_id))
)
WITH CHECK (
  pm_can_approve_hours(auth.uid())
  OR (has_module_permission(auth.uid(), 'timesheets.approve', 'team') AND pm_has_team_access(auth.uid(), user_id))
);

-- 4. quote_stages
DROP POLICY IF EXISTS "Authorized read quote_stages" ON public.quote_stages;
CREATE POLICY "Authorized read quote_stages" ON public.quote_stages FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'crm.pipeline')
  OR has_permission(auth.uid(), 'finance.dashboard')
  OR has_module_permission(auth.uid(), 'crm.pipeline.view', 'all')
);

-- 5. salary_snapshots (also: TO public -> TO authenticated)
DROP POLICY IF EXISTS "Read salary snapshots" ON public.salary_snapshots;
CREATE POLICY "Read salary snapshots" ON public.salary_snapshots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR collaborator_id = get_my_collaborator_id()
  OR has_permission(auth.uid(), 'hr.colaborador.compensation.view')
  OR has_permission(auth.uid(), 'hr.resumo.compensation.view')
  OR has_module_permission(auth.uid(), 'hr.compensation.view', 'all')
);

-- 6. collaborators (also: TO public -> TO authenticated)
DROP POLICY IF EXISTS "Read collaborators" ON public.collaborators;
CREATE POLICY "Read collaborators" ON public.collaborators FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR id = get_my_collaborator_id()
  OR has_permission(auth.uid(), 'hr.colaborador.view')
  OR has_permission(auth.uid(), 'hr.colaboradores')
  OR has_module_permission(auth.uid(), 'hr.collaborator.view', 'all')
  OR has_module_permission(auth.uid(), 'hr.collaborators.view', 'all')
);

-- 7. benefit_expenses
DROP POLICY IF EXISTS "Users see own expenses; approvers and admins see all" ON public.benefit_expenses;
CREATE POLICY "Users see own expenses; approvers and admins see all" ON public.benefit_expenses FOR SELECT TO authenticated
USING (
  can_approve_benefits(auth.uid())
  OR collaborator_id = get_my_collaborator_id()
  OR has_module_permission(auth.uid(), 'hr.benefits.approve', 'all')
);

-- 8. vacation_requests
DROP POLICY IF EXISTS "Users see own + admins all" ON public.vacation_requests;
CREATE POLICY "Users see own + admins all" ON public.vacation_requests FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR collaborator_id = get_my_collaborator_id()
  OR has_module_permission(auth.uid(), 'hr.leave.approve', 'all')
);