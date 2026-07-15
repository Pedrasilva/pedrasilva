
-- 1) quote_billable_hourly_rates
DROP POLICY IF EXISTS "Authenticated can read billable rates" ON public.quote_billable_hourly_rates;
DROP POLICY IF EXISTS "Authenticated can insert billable rates" ON public.quote_billable_hourly_rates;
DROP POLICY IF EXISTS "Authenticated can update billable rates" ON public.quote_billable_hourly_rates;
DROP POLICY IF EXISTS "Authenticated can delete billable rates" ON public.quote_billable_hourly_rates;

CREATE POLICY "Commercial users read billable rates" ON public.quote_billable_hourly_rates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE POLICY "Commercial users insert billable rates" ON public.quote_billable_hourly_rates
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE POLICY "Commercial users update billable rates" ON public.quote_billable_hourly_rates
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE POLICY "Commercial users delete billable rates" ON public.quote_billable_hourly_rates
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'));

-- 2) quote_site_trips
DROP POLICY IF EXISTS "Authenticated users manage site trips" ON public.quote_site_trips;
CREATE POLICY "Commercial users manage site trips" ON public.quote_site_trips
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'));

-- 3) quote_supplier_markups
DROP POLICY IF EXISTS "Authenticated read quote supplier markups" ON public.quote_supplier_markups;
DROP POLICY IF EXISTS "Authenticated write quote supplier markups" ON public.quote_supplier_markups;
CREATE POLICY "Commercial users read supplier markups" ON public.quote_supplier_markups
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'));
CREATE POLICY "Commercial users write supplier markups" ON public.quote_supplier_markups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'crm.pipeline') OR has_permission(auth.uid(),'finance.dashboard'));

-- 4) pm_time_entries: retainer visibility scoped to project team members
DROP POLICY IF EXISTS "Retainer entries visible to team" ON public.pm_time_entries;
CREATE POLICY "Retainer entries visible to project team" ON public.pm_time_entries
  FOR SELECT TO authenticated
  USING (
    pm_stage_id IS NOT NULL
    AND pm_is_retainer_stage(pm_stage_id)
    AND EXISTS (
      SELECT 1
      FROM public.pm_stages target_stage
      JOIN public.pm_stages sibling ON sibling.project_id = target_stage.project_id
      JOIN public.pm_allocations a ON a.stage_id = sibling.id
      WHERE target_stage.id = pm_time_entries.pm_stage_id
        AND a.resource_id = public.pm_get_my_resource_id()
    )
  );

-- 5) projects
DROP POLICY IF EXISTS "Members read projects" ON public.projects;
CREATE POLICY "Members read projects" ON public.projects
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR has_permission(auth.uid(),'projects.all')
    OR has_permission(auth.uid(),'finance.dashboard')
    OR EXISTS (
      SELECT 1 FROM public.pm_stages s
      JOIN public.pm_allocations a ON a.stage_id = s.id
      WHERE s.project_id = projects.id
        AND a.resource_id = public.pm_get_my_resource_id()
    )
  );
