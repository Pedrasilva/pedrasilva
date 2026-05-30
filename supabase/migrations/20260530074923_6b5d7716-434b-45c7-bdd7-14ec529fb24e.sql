DROP POLICY IF EXISTS "Authenticated can write project commercial baselines" ON public.pm_project_commercial_baselines;
CREATE POLICY "Admins can write project commercial baselines"
  ON public.pm_project_commercial_baselines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can write project forecast metrics" ON public.pm_project_forecast_metrics;
CREATE POLICY "Admins can write project forecast metrics"
  ON public.pm_project_forecast_metrics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can write resource allocations forecast" ON public.pm_resource_allocations_forecast;
CREATE POLICY "Admins can write resource allocations forecast"
  ON public.pm_resource_allocations_forecast
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can write allocation placeholders" ON public.pm_stage_allocation_placeholders;
CREATE POLICY "Admins can write allocation placeholders"
  ON public.pm_stage_allocation_placeholders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can write stage capacity snapshots" ON public.pm_stage_capacity_snapshots;
CREATE POLICY "Admins can write stage capacity snapshots"
  ON public.pm_stage_capacity_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can write stage commercial baselines" ON public.pm_stage_commercial_baselines;
CREATE POLICY "Admins can write stage commercial baselines"
  ON public.pm_stage_commercial_baselines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));