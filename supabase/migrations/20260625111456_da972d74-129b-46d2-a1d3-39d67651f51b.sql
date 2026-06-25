
-- Helper predicates inlined as expressions for clarity.

-- =========================
-- crm_opportunities: restrict SELECT
-- =========================
DROP POLICY IF EXISTS "Authenticated read crm_opportunities" ON public.crm_opportunities;
CREATE POLICY "Authorized read crm_opportunities"
  ON public.crm_opportunities
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'crm.pipeline')
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

-- =========================
-- pm_projects: restrict SELECT to admin/finance/projects.financials
-- =========================
DROP POLICY IF EXISTS "Authenticated read pm_projects" ON public.pm_projects;
CREATE POLICY "Authorized read pm_projects"
  ON public.pm_projects
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
    OR public.has_permission(auth.uid(), 'projects.all')
  );

-- =========================
-- pm_stages: restrict SELECT
-- =========================
DROP POLICY IF EXISTS "Authenticated read pm_stages" ON public.pm_stages;
CREATE POLICY "Authorized read pm_stages"
  ON public.pm_stages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
    OR public.has_permission(auth.uid(), 'projects.all')
  );

-- =========================
-- pm_project_contract_baseline + stages + payments: restrict SELECT and INSERT
-- =========================
DROP POLICY IF EXISTS baseline_read ON public.pm_project_contract_baseline;
CREATE POLICY baseline_read
  ON public.pm_project_contract_baseline
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
  );

DROP POLICY IF EXISTS baseline_insert ON public.pm_project_contract_baseline;
CREATE POLICY baseline_insert
  ON public.pm_project_contract_baseline
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
  );

DROP POLICY IF EXISTS baseline_stages_read ON public.pm_project_contract_baseline_stages;
CREATE POLICY baseline_stages_read
  ON public.pm_project_contract_baseline_stages
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
  );

DROP POLICY IF EXISTS baseline_stages_insert ON public.pm_project_contract_baseline_stages;
CREATE POLICY baseline_stages_insert
  ON public.pm_project_contract_baseline_stages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
  );

DROP POLICY IF EXISTS baseline_payments_read ON public.pm_project_contract_baseline_payments;
CREATE POLICY baseline_payments_read
  ON public.pm_project_contract_baseline_payments
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
  );

DROP POLICY IF EXISTS baseline_payments_insert ON public.pm_project_contract_baseline_payments;
CREATE POLICY baseline_payments_insert
  ON public.pm_project_contract_baseline_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_permission(auth.uid(), 'projects.financials')
  );

-- =========================
-- quote_external_services / quote_stages / quote_payment_schedule_items / quote_proposal_documents
-- =========================
DROP POLICY IF EXISTS "Authenticated read quote_external_services" ON public.quote_external_services;
CREATE POLICY "Authorized read quote_external_services"
  ON public.quote_external_services FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'crm.pipeline')
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

DROP POLICY IF EXISTS "Authenticated read quote_stages" ON public.quote_stages;
CREATE POLICY "Authorized read quote_stages"
  ON public.quote_stages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'crm.pipeline')
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

DROP POLICY IF EXISTS "Authenticated read quote_payment_schedule_items" ON public.quote_payment_schedule_items;
CREATE POLICY "Authorized read quote_payment_schedule_items"
  ON public.quote_payment_schedule_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'crm.pipeline')
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

DROP POLICY IF EXISTS "Authenticated read quote_proposal_documents" ON public.quote_proposal_documents;
CREATE POLICY "Authorized read quote_proposal_documents"
  ON public.quote_proposal_documents FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'crm.pipeline')
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

-- =========================
-- quote_allocations: tighten role from public -> authenticated
-- =========================
DROP POLICY IF EXISTS "Finance read quote_allocations" ON public.quote_allocations;
CREATE POLICY "Finance read quote_allocations"
  ON public.quote_allocations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
  );

-- =========================
-- Storage: explicit SELECT policy on collaborator-photos bucket
-- =========================
DROP POLICY IF EXISTS "Authenticated read collaborator photos" ON storage.objects;
CREATE POLICY "Authenticated read collaborator photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'collaborator-photos');
