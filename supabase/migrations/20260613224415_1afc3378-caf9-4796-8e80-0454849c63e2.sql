
-- fee_proposals: restrict read to admin / CRM / finance
DROP POLICY IF EXISTS "Authenticated read fee_proposals" ON public.fee_proposals;
CREATE POLICY "Restricted read fee_proposals"
  ON public.fee_proposals FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.dashboard'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

-- pm_project_commercial_baselines
DROP POLICY IF EXISTS "Authenticated can read project commercial baselines" ON public.pm_project_commercial_baselines;
CREATE POLICY "Restricted read project commercial baselines"
  ON public.pm_project_commercial_baselines FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_permission(auth.uid(), 'projects.dashboard'::text)
  );

-- pm_project_forecast_metrics
DROP POLICY IF EXISTS "Authenticated can read project forecast metrics" ON public.pm_project_forecast_metrics;
CREATE POLICY "Restricted read project forecast metrics"
  ON public.pm_project_forecast_metrics FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_permission(auth.uid(), 'projects.dashboard'::text)
  );

-- pm_resource_allocations_forecast
DROP POLICY IF EXISTS "Authenticated can read resource allocations forecast" ON public.pm_resource_allocations_forecast;
CREATE POLICY "Restricted read resource allocations forecast"
  ON public.pm_resource_allocations_forecast FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_permission(auth.uid(), 'projects.dashboard'::text)
  );

-- pm_stage_allocation_placeholders
DROP POLICY IF EXISTS "Authenticated can read allocation placeholders" ON public.pm_stage_allocation_placeholders;
CREATE POLICY "Restricted read allocation placeholders"
  ON public.pm_stage_allocation_placeholders FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_permission(auth.uid(), 'projects.dashboard'::text)
  );

-- pm_stage_capacity_snapshots
DROP POLICY IF EXISTS "Authenticated can read stage capacity snapshots" ON public.pm_stage_capacity_snapshots;
CREATE POLICY "Restricted read stage capacity snapshots"
  ON public.pm_stage_capacity_snapshots FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_permission(auth.uid(), 'projects.dashboard'::text)
  );

-- pm_stage_commercial_baselines
DROP POLICY IF EXISTS "Authenticated can read stage commercial baselines" ON public.pm_stage_commercial_baselines;
CREATE POLICY "Restricted read stage commercial baselines"
  ON public.pm_stage_commercial_baselines FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
    OR has_permission(auth.uid(), 'projects.dashboard'::text)
  );
