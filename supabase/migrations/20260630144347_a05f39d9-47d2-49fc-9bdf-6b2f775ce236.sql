
-- 1. pm_stage_supplier_costs
DROP POLICY IF EXISTS pmssc_read ON public.pm_stage_supplier_costs;
DROP POLICY IF EXISTS pmssc_write ON public.pm_stage_supplier_costs;
CREATE POLICY pmssc_read ON public.pm_stage_supplier_costs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'finance.dashboard')
    OR has_permission(auth.uid(), 'projects.financials')
  );
CREATE POLICY pmssc_write ON public.pm_stage_supplier_costs
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'projects.financials')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'projects.financials')
  );

-- 2. quote_stage_supplier_costs
DROP POLICY IF EXISTS qssc_read ON public.quote_stage_supplier_costs;
DROP POLICY IF EXISTS qssc_write ON public.quote_stage_supplier_costs;
CREATE POLICY qssc_read ON public.quote_stage_supplier_costs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
    OR has_permission(auth.uid(), 'finance.dashboard')
  );
CREATE POLICY qssc_write ON public.quote_stage_supplier_costs
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  );

-- 3. psa_proposals
DROP POLICY IF EXISTS psa_proposals_auth_all ON public.psa_proposals;
CREATE POLICY psa_proposals_read ON public.psa_proposals
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
    OR created_by = auth.uid()
  );
CREATE POLICY psa_proposals_insert ON public.psa_proposals
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  );
CREATE POLICY psa_proposals_update ON public.psa_proposals
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  );
CREATE POLICY psa_proposals_delete ON public.psa_proposals
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. psa_proposal_blocks
DROP POLICY IF EXISTS psa_blocks_auth_all ON public.psa_proposal_blocks;
CREATE POLICY psa_blocks_read ON public.psa_proposal_blocks
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
    OR EXISTS (
      SELECT 1 FROM public.psa_proposals p
      WHERE p.id = psa_proposal_blocks.proposal_id AND p.created_by = auth.uid()
    )
  );
CREATE POLICY psa_blocks_write ON public.psa_proposal_blocks
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  );

-- 5. psa_proposal_audit
DROP POLICY IF EXISTS psa_audit_auth_read ON public.psa_proposal_audit;
DROP POLICY IF EXISTS psa_audit_auth_insert ON public.psa_proposal_audit;
CREATE POLICY psa_audit_read ON public.psa_proposal_audit
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  );
CREATE POLICY psa_audit_insert ON public.psa_proposal_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'crm.pipeline')
  );

-- 6. benefit_expense_ocr_extractions — remove broad approver SELECT access
DROP POLICY IF EXISTS "Users read own OCR; approvers/admins read all" ON public.benefit_expense_ocr_extractions;
CREATE POLICY "Users read own OCR; admins read all"
  ON public.benefit_expense_ocr_extractions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR collaborator_id = get_my_collaborator_id()
  );
