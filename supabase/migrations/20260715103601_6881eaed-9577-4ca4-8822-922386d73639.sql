
-- Helper: user can view project-scoped data (admin or has projects.view permission)
CREATE OR REPLACE FUNCTION public.pm_can_view_projects(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_permission(_user_id, 'projects.view');
$$;

-- projects: tighten SELECT
DROP POLICY IF EXISTS "Authenticated read projects" ON public.projects;
CREATE POLICY "Members read projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (public.pm_can_view_projects(auth.uid()));

-- pm_activities
DROP POLICY IF EXISTS "Authenticated read pm_activities" ON public.pm_activities;
CREATE POLICY "Members read pm_activities"
  ON public.pm_activities FOR SELECT
  TO authenticated
  USING (public.pm_can_view_projects(auth.uid()));

-- pm_activity_replies
DROP POLICY IF EXISTS "Authenticated read pm_activity_replies" ON public.pm_activity_replies;
CREATE POLICY "Members read pm_activity_replies"
  ON public.pm_activity_replies FOR SELECT
  TO authenticated
  USING (public.pm_can_view_projects(auth.uid()));

-- pm_allocations
DROP POLICY IF EXISTS "Authenticated read pm_allocations" ON public.pm_allocations;
CREATE POLICY "Members read pm_allocations"
  ON public.pm_allocations FOR SELECT
  TO authenticated
  USING (
    public.pm_can_view_projects(auth.uid())
    OR resource_id = public.pm_get_my_resource_id()
  );

-- pm_stage_dependencies
DROP POLICY IF EXISTS "Authenticated read pm_stage_dependencies" ON public.pm_stage_dependencies;
CREATE POLICY "Members read pm_stage_dependencies"
  ON public.pm_stage_dependencies FOR SELECT
  TO authenticated
  USING (public.pm_can_view_projects(auth.uid()));

-- pm_tasks
DROP POLICY IF EXISTS "Authenticated read pm_tasks" ON public.pm_tasks;
CREATE POLICY "Members read pm_tasks"
  ON public.pm_tasks FOR SELECT
  TO authenticated
  USING (
    public.pm_can_view_projects(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.pm_allocations a
      WHERE a.id = pm_tasks.allocation_id
        AND a.resource_id = public.pm_get_my_resource_id()
    )
  );

-- fee_proposal_audit_log: restrict INSERT to actor = auth.uid()
DROP POLICY IF EXISTS "Authenticated write audit log" ON public.fee_proposal_audit_log;
CREATE POLICY "Users insert own audit rows"
  ON public.fee_proposal_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor = auth.uid());

-- psa_proposal_snapshots: restrict writes
DROP POLICY IF EXISTS "Authenticated can create proposal snapshots" ON public.psa_proposal_snapshots;
DROP POLICY IF EXISTS "Authenticated can delete proposal snapshots" ON public.psa_proposal_snapshots;

CREATE POLICY "Users create own proposal snapshots"
  ON public.psa_proposal_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_permission(auth.uid(), 'projects.view')
    )
  );

CREATE POLICY "Admins or owners delete proposal snapshots"
  ON public.psa_proposal_snapshots FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
  );
