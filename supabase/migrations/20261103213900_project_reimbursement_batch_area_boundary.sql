CREATE FUNCTION public.pm_phase_a_batch_gate(_batch uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT public.pm_project_access_cutover_active() OR NOT EXISTS(SELECT 1 FROM public.project_reimbursement_allocations a JOIN public.finance_holder_reimbursements o ON o.id=a.obligation_id LEFT JOIN public.pm_expenses e ON e.id=o.project_expense_id WHERE a.batch_id=_batch AND (e.id IS NULL OR NOT public.pm_project_area_proposed(e.project_id,'expenses',auth.uid())))
$$;
REVOKE ALL ON FUNCTION public.pm_phase_a_batch_gate(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_phase_a_batch_gate(uuid) TO authenticated,service_role;
CREATE POLICY phase_a_batch_area_gate ON public.project_reimbursement_batches AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_batch_gate(id));
COMMENT ON FUNCTION public.pm_phase_a_batch_gate(uuid) IS 'Batch totals and metadata require every included project Expenses area at cutover, avoiding hidden-child totals and parent/child RLS recursion.';