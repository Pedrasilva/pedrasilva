CREATE OR REPLACE FUNCTION public.can_edit_project_payment_dates(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.pm_payment_finance_access(_project) OR
 (auth.uid() IS NOT NULL AND public.is_psa_staff() AND EXISTS(
 SELECT 1 FROM public.pm_project_team WHERE project_id=_project AND role='manager'
 AND resource_id=public.pm_unique_viewer_resource()) AND
 (NOT public.pm_project_access_cutover_active() OR public.pm_project_area_proposed(_project,'financials',auth.uid())))
$$;
CREATE OR REPLACE FUNCTION public.pm_phase_a_area_gate(_project uuid,_area text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT public.pm_project_access_cutover_active() OR public.pm_project_area_proposed(_project,_area,auth.uid())
$$;
REVOKE ALL ON FUNCTION public.pm_phase_a_area_gate(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_phase_a_area_gate(uuid,text) TO authenticated,service_role;
CREATE POLICY phase_a_financial_gate ON public.pm_invoices AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_area_gate(project_id,'financials'));
CREATE POLICY phase_a_financial_gate ON public.pm_payment_schedule_items AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_area_gate(project_id,CASE WHEN direction='inflow' THEN 'financials' ELSE 'supplier_fees' END));
CREATE POLICY phase_a_financial_gate ON public.pm_invoice_items AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pm_invoices i WHERE i.id=invoice_id AND public.pm_phase_a_area_gate(i.project_id,'financials')));
CREATE POLICY phase_a_financial_gate ON public.pm_project_contract_baseline AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_area_gate(project_id,'financials'));
CREATE POLICY phase_a_financial_gate ON public.pm_project_contract_baseline_payments AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pm_project_contract_baseline b WHERE b.id=baseline_id AND public.pm_phase_a_area_gate(b.project_id,'financials')));
CREATE POLICY phase_a_financial_gate ON public.pm_project_contract_baseline_stages AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.pm_project_contract_baseline b WHERE b.id=baseline_id AND public.pm_phase_a_area_gate(b.project_id,'financials')));
CREATE POLICY phase_a_expense_gate ON public.pm_expenses AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_area_gate(project_id,'expenses') OR submitted_by=auth.uid());
CREATE POLICY phase_a_supplier_gate ON public.pm_stage_supplier_costs AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_area_gate(project_id,'supplier_fees'));
COMMENT ON FUNCTION public.pm_phase_a_area_gate(uuid,text) IS 'Staged restrictive predicate. Cutover gate stays false until separate matrix approval; existing authorization is unchanged.';