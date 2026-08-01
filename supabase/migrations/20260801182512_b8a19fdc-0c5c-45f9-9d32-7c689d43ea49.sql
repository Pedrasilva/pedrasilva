-- C1: v2-scoped SELECT policies on project financial data (legacy OR fallback kept)

-- 1) pm_payment_schedule_items (project_id)
DROP POLICY IF EXISTS "Authorized read pm_payment_schedule_items" ON public.pm_payment_schedule_items;
CREATE POLICY "Authorized read pm_payment_schedule_items"
ON public.pm_payment_schedule_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.view_financials', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
  -- legacy fallback (trial period)
  OR has_permission(auth.uid(), 'projects.view')
  OR has_permission(auth.uid(), 'finance.dashboard')
);

-- 2) quote_payment_schedule_items (quote_id -> fee_proposals.pm_project_id)
DROP POLICY IF EXISTS "Authorized read quote_payment_schedule_items" ON public.quote_payment_schedule_items;
CREATE POLICY "Authorized read quote_payment_schedule_items"
ON public.quote_payment_schedule_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.view_financials', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
    AND EXISTS (
      SELECT 1 FROM public.fee_proposals fp
      WHERE fp.id = quote_payment_schedule_items.quote_id
        AND fp.pm_project_id IS NOT NULL
        AND pm_has_assigned_access(auth.uid(), fp.pm_project_id)
    )
  )
  -- legacy fallback (trial period)
  OR has_permission(auth.uid(), 'crm.pipeline')
  OR has_permission(auth.uid(), 'finance.dashboard')
);

-- 3) pm_project_commercial_baselines (public -> authenticated)
DROP POLICY IF EXISTS "Restricted read project commercial baselines" ON public.pm_project_commercial_baselines;
CREATE POLICY "Restricted read project commercial baselines"
ON public.pm_project_commercial_baselines FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.view_financials', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
  -- legacy fallback (trial period)
  OR has_permission(auth.uid(), 'finance.dashboard')
  OR has_permission(auth.uid(), 'projects.dashboard')
);

-- 4) pm_stage_supplier_costs (project_id)
DROP POLICY IF EXISTS "pmssc_read" ON public.pm_stage_supplier_costs;
CREATE POLICY "pmssc_read"
ON public.pm_stage_supplier_costs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.view_financials', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
  -- legacy fallback (trial period)
  OR has_permission(auth.uid(), 'finance.dashboard')
  OR has_permission(auth.uid(), 'projects.financials')
);

-- 5) quote_stage_supplier_costs (quote_id -> fee_proposals.pm_project_id)
DROP POLICY IF EXISTS "qssc_read" ON public.quote_stage_supplier_costs;
CREATE POLICY "qssc_read"
ON public.quote_stage_supplier_costs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.view_financials', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
    AND EXISTS (
      SELECT 1 FROM public.fee_proposals fp
      WHERE fp.id = quote_stage_supplier_costs.quote_id
        AND fp.pm_project_id IS NOT NULL
        AND pm_has_assigned_access(auth.uid(), fp.pm_project_id)
    )
  )
  -- legacy fallback (trial period)
  OR has_permission(auth.uid(), 'crm.pipeline')
  OR has_permission(auth.uid(), 'finance.dashboard')
);

-- 6) pm_invoices (currently admin-only -> widen with v2 scoping)
DROP POLICY IF EXISTS "Admins read pm_invoices" ON public.pm_invoices;
CREATE POLICY "Authorized read pm_invoices"
ON public.pm_invoices FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_module_permission(auth.uid(), 'projects.view_financials', 'all')
  OR (
    has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
    AND pm_has_assigned_access(auth.uid(), project_id)
  )
  OR has_permission(auth.uid(), 'finance.dashboard')
);