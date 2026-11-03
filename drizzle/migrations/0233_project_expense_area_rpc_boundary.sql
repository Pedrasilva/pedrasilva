CREATE FUNCTION public.pm_require_expense_area(_expense uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF public.pm_project_access_cutover_active() AND NOT EXISTS(SELECT 1 FROM public.pm_expenses e WHERE e.id=_expense AND public.pm_project_area_proposed(e.project_id,'expenses',auth.uid())) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; END $$;
REVOKE ALL ON FUNCTION public.pm_require_expense_area(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pm_require_expense_action_area(_action text,_data jsonb) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_expense uuid; r record;
BEGIN
 IF NOT public.pm_project_access_cutover_active() THEN RETURN; END IF;
 v_expense:=nullif(_data->>'expenseId','')::uuid;
 IF v_expense IS NOT NULL THEN PERFORM public.pm_require_expense_area(v_expense); RETURN; END IF;
 IF _action='save' THEN IF NOT public.pm_project_area_proposed(nullif(_data->>'projectId','')::uuid,'expenses',auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; RETURN; END IF;
 IF _action='batch' THEN FOR r IN SELECT o.project_expense_id FROM public.finance_holder_reimbursements o WHERE o.id IN (SELECT value::uuid FROM jsonb_array_elements_text(_data->'obligationIds')) LOOP PERFORM public.pm_require_expense_area(r.project_expense_id); END LOOP; RETURN; END IF;
 IF _action='settleBatch' THEN FOR r IN SELECT o.project_expense_id FROM public.project_reimbursement_allocations a JOIN public.finance_holder_reimbursements o ON o.id=a.obligation_id WHERE a.batch_id=nullif(_data->>'batchId','')::uuid LOOP PERFORM public.pm_require_expense_area(r.project_expense_id); END LOOP; RETURN; END IF;
 IF _action='reverseReimbursement' THEN SELECT o.project_expense_id INTO v_expense FROM public.project_reimbursement_allocations a JOIN public.finance_holder_reimbursements o ON o.id=a.obligation_id WHERE a.id=nullif(_data->>'allocationId','')::uuid;
 ELSIF _action='reverseReceipt' THEN SELECT a.expense_id INTO v_expense FROM public.project_expense_receipt_allocations r JOIN public.project_expense_invoice_allocations a ON a.id=r.invoice_allocation_id WHERE r.id=nullif(_data->>'allocationId','')::uuid;
 ELSE SELECT expense_id INTO v_expense FROM public.project_expense_invoice_allocations WHERE id=nullif(_data->>'allocationId','')::uuid; END IF;
 PERFORM public.pm_require_expense_area(v_expense);
END $$;
REVOKE ALL ON FUNCTION public.pm_require_expense_action_area(text,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.pe_action(text,jsonb)'::regprocedure) INTO d;
 IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing pe_action boundary'; END IF;
 d:=overlay(d placing 'BEGIN PERFORM public.pm_require_expense_action_area(_action,_data);' from position('BEGIN' in d) for 5); EXECUTE d;
 SELECT pg_get_functiondef('public.pe_link_queue(uuid,uuid)'::regprocedure) INTO d;
 IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing pe_link_queue boundary'; END IF;
 d:=overlay(d placing 'BEGIN PERFORM public.pm_require_expense_area(_expense);' from position('BEGIN' in d) for 5); EXECUTE d;
 SELECT pg_get_functiondef('public.pe_confirm_intake(uuid,uuid,jsonb)'::regprocedure) INTO d;
 IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing pe_confirm_intake boundary'; END IF;
 d:=overlay(d placing 'BEGIN PERFORM public.pm_require_expense_area(_expense);' from position('BEGIN' in d) for 5); EXECUTE d;
 SELECT pg_get_functiondef('public.pe_save_intake(uuid,jsonb,boolean)'::regprocedure) INTO d;
 IF position('SELECT * INTO v_queue FROM financial_document_review_queue WHERE id=_queue FOR UPDATE;' in d)=0 THEN RAISE EXCEPTION 'Missing pe_save_intake claim'; END IF;
 d:=replace(d,'SELECT * INTO v_queue FROM financial_document_review_queue WHERE id=_queue FOR UPDATE;','SELECT * INTO v_queue FROM financial_document_review_queue WHERE id=_queue FOR UPDATE; IF public.pm_project_access_cutover_active() THEN IF v_queue.source_project_expense_id IS NOT NULL THEN PERFORM public.pm_require_expense_area(v_queue.source_project_expense_id); ELSIF v_queue.duplicate_of_id IS NOT NULL THEN PERFORM public.pm_require_expense_area((SELECT source_project_expense_id FROM financial_document_review_queue WHERE id=v_queue.duplicate_of_id)); ELSE PERFORM public.pm_require_expense_action_area(''save'',_data); END IF; END IF;'); EXECUTE d;
END $$;
CREATE POLICY phase_a_reimbursement_gate ON public.finance_holder_reimbursements AS RESTRICTIVE FOR SELECT TO authenticated USING(project_expense_id IS NULL OR NOT public.pm_project_access_cutover_active() OR public.pm_phase_a_expense_read(project_expense_id));
CREATE POLICY phase_a_reimbursement_gate ON public.project_reimbursement_allocations AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.pm_project_access_cutover_active() OR EXISTS(SELECT 1 FROM public.finance_holder_reimbursements o WHERE o.id=obligation_id));