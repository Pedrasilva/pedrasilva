
-- Restrict CRM accounts SELECT
DROP POLICY IF EXISTS "Authenticated read crm_accounts" ON public.crm_accounts;
CREATE POLICY "CRM read crm_accounts" ON public.crm_accounts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

-- Restrict CRM activities SELECT
DROP POLICY IF EXISTS "Authenticated read crm_activities" ON public.crm_activities;
CREATE POLICY "CRM read crm_activities" ON public.crm_activities
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

-- Restrict opportunity_activities INSERT and SELECT
DROP POLICY IF EXISTS "Authenticated insert opportunity_activities" ON public.opportunity_activities;
DROP POLICY IF EXISTS "Authenticated read opportunity_activities" ON public.opportunity_activities;
CREATE POLICY "CRM read opportunity_activities" ON public.opportunity_activities
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );
CREATE POLICY "CRM insert opportunity_activities" ON public.opportunity_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline'::text)
  );

-- Scope pm_resources SELECT policy to authenticated role only
DROP POLICY IF EXISTS "Finance read pm_resources" ON public.pm_resources;
CREATE POLICY "Finance read pm_resources" ON public.pm_resources
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

-- Restrict quote_proposal_document_blocks SELECT
DROP POLICY IF EXISTS "Authenticated read quote_proposal_document_blocks" ON public.quote_proposal_document_blocks;
CREATE POLICY "CRM read quote_proposal_document_blocks" ON public.quote_proposal_document_blocks
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

-- Restrict quote_stage_dependencies SELECT
DROP POLICY IF EXISTS "Authenticated read quote_stage_dependencies" ON public.quote_stage_dependencies;
CREATE POLICY "CRM read quote_stage_dependencies" ON public.quote_stage_dependencies
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

-- Restrict quote_supplier_phase_splits SELECT
DROP POLICY IF EXISTS "Authenticated read quote_supplier_phase_splits" ON public.quote_supplier_phase_splits;
CREATE POLICY "CRM read quote_supplier_phase_splits" ON public.quote_supplier_phase_splits
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

-- Remove broad listing on public collaborator-photos bucket;
-- public file URLs continue to work, but listing is restricted to admins.
DROP POLICY IF EXISTS "Authenticated read collaborator photos" ON storage.objects;
CREATE POLICY "Admins list collaborator photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'collaborator-photos'
    AND has_role(auth.uid(), 'admin'::app_role)
  );
