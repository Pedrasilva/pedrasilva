CREATE OR REPLACE FUNCTION public.is_psa_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN coalesce(auth.role(),'') NOT IN ('authenticated','anon') THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE public.has_role(auth.uid(),'admin')
      OR EXISTS (SELECT 1 FROM public.user_role_assignments r WHERE r.user_id = auth.uid() AND r.role::text = 'admin')
      OR EXISTS (SELECT 1 FROM public.collaborators c JOIN auth.users u ON lower(u.email) = lower(c.email)
                 WHERE u.id = auth.uid() AND c.archived_at IS NULL)
  END
$$;

CREATE OR REPLACE FUNCTION public.is_non_psa_entity_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.finance_entity_members m JOIN public.finance_entities e ON e.id = m.entity_id
    WHERE m.user_id = auth.uid() AND e.active AND e.id <> '00000000-0000-4000-a000-000000000001')
$$;
GRANT EXECUTE ON FUNCTION public.is_non_psa_entity_member() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.company_psa_referenced(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.benefit_expenses x WHERE x.supplier_company_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.contacts x WHERE x.company_id = _id)
   OR EXISTS (SELECT 1 FROM public.pm_projects x WHERE x.company_id = _id)
   OR EXISTS (SELECT 1 FROM public.pm_materials x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.pm_expenses x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.fee_proposals x WHERE x.company_id = _id)
   OR EXISTS (SELECT 1 FROM public.crm_activities x WHERE x.company_id = _id)
   OR EXISTS (SELECT 1 FROM public.crm_accounts x WHERE x.company_id = _id)
   OR EXISTS (SELECT 1 FROM public.crm_opportunities x WHERE x.company_id = _id)
   OR EXISTS (SELECT 1 FROM public.company_expenses x WHERE x.supplier_company_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.quote_stages x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.quote_external_services x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.quote_payment_schedule_items x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.financial_income_items x WHERE x.client_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.financial_expense_items x WHERE x.supplier_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.financial_documents x WHERE x.counterparty_client_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.financial_documents x WHERE x.counterparty_supplier_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.historical_time_entries x WHERE x.company_id = _id)
   OR EXISTS (SELECT 1 FROM public.benefit_expense_ocr_extractions x WHERE x.matched_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.contracts x WHERE x.source_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.quote_supplier_phase_splits x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.pm_payment_schedule_items x WHERE x.supplier_company_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.quote_supplier_markups x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.financial_document_review_queue x WHERE x.matched_client_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.financial_document_review_queue x WHERE x.matched_supplier_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.tax_withholdings x WHERE x.supplier_company_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.inventory_assets x WHERE x.supplier_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.marketing_actions x WHERE x.crm_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.finance_recebimentos x WHERE x.company_id = _id AND x.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.crm_email_lead_drafts x WHERE x.matched_company_id = _id)
   OR EXISTS (SELECT 1 FROM public.bank_transaction_classifications x JOIN public.bank_transactions b ON b.id = x.bank_transaction_id WHERE x.supplier_id = _id AND b.entity_id = '00000000-0000-4000-a000-000000000001')
   OR EXISTS (SELECT 1 FROM public.bank_transaction_classifications x JOIN public.bank_transactions b ON b.id = x.bank_transaction_id WHERE x.client_id = _id AND b.entity_id = '00000000-0000-4000-a000-000000000001')
$$;
GRANT EXECUTE ON FUNCTION public.company_psa_referenced(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS psa_staff_or_own_suppliers ON public.companies;
CREATE POLICY psa_staff_or_own_suppliers ON public.companies AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.is_psa_staff() OR public.fin_company_visible(id)
         OR (created_by = auth.uid() AND public.is_non_psa_entity_member()));

DROP POLICY IF EXISTS psa_staff_only_insert ON public.companies;
CREATE POLICY psa_staff_or_entity_member_insert ON public.companies AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_psa_staff() OR (public.is_non_psa_entity_member() AND created_by = auth.uid()));

DROP POLICY IF EXISTS psa_staff_only_update ON public.companies;
CREATE POLICY psa_staff_or_unshared_update ON public.companies AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_psa_staff() OR (public.is_non_psa_entity_member()
         AND (public.fin_company_visible(id) OR created_by = auth.uid())
         AND NOT public.company_psa_referenced(id)))
  WITH CHECK (public.is_psa_staff() OR (public.is_non_psa_entity_member()
         AND NOT public.company_psa_referenced(id)));