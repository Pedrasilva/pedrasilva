CREATE OR REPLACE FUNCTION public.fin_project_expense_lists() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE rows jsonb;
BEGIN
 IF NOT public.fin_invoice_queue_access() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('project_name',p.name,'client_name',c.nome,'person_name',co.nome,'invoice_pending',CASE WHEN e.invoiced_at IS NOT NULL THEN 0 WHEN e.workflow_version=2 THEN greatest(0,round(e.eur_amount*CASE WHEN e.rebill_mode='markup' THEN 1+coalesce(e.markup_pct,0)/100 ELSE 1 END,2)-coalesce(f.billed_amount,0)+coalesce(s.credited_net,0)) ELSE e.sale_price END,'reimbursement_pending',CASE WHEN e.workflow_version=2 THEN greatest(0,e.eur_amount-coalesce(f.reimbursed_amount,0)) WHEN e.status::text='paid' OR e.paid_at IS NOT NULL THEN 0 ELSE e.purchase_price END,'reserved_amount',coalesce(f.reserved_amount,0),'receipt_bucket',coalesce((SELECT q.source_bucket FROM public.financial_document_review_queue q WHERE q.source_project_expense_id=e.id AND q.source_file_url=e.receipt_path LIMIT 1),'benefit-receipts')) ORDER BY p.name,e.created_at,e.id),'[]') INTO rows
 FROM public.pm_expenses e JOIN public.pm_projects p ON p.id=e.project_id LEFT JOIN public.companies c ON c.id=p.company_id LEFT JOIN public.collaborators co ON co.id=e.reimburse_collaborator_id
 LEFT JOIN public.pe_expense_figures(NULL) f ON f.expense_id=e.id LEFT JOIN public.pe_expense_settlement_figures(NULL) s ON s.expense_id=e.id
 WHERE (e.entity_id='00000000-0000-4000-a000-000000000001'::uuid OR e.workflow_version=1 AND e.entity_id IS NULL) AND public.pm_phase_a_area_gate(e.project_id,'expenses') AND public.is_psa_staff();
 RETURN jsonb_build_object('rows',rows,'today',(now() AT TIME ZONE 'Europe/Lisbon')::date);
END $$;
CREATE OR REPLACE FUNCTION public.fin_mark_expense_invoiced(_expense uuid,_number text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.pm_expenses; b jsonb; a jsonb;
BEGIN
 SELECT * INTO e FROM public.pm_expenses WHERE id=_expense FOR UPDATE;
 IF NOT FOUND OR NOT public.fin_invoice_queue_access() OR NOT public.pe_finance_access(e.entity_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; PERFORM public.pm_require_expense_area(e.id);
 IF e.workflow_version<>2 THEN RAISE EXCEPTION 'Historical adaptation requires separate approval'; END IF;
 IF e.invoiced_at IS NOT NULL AND e.invoice_reference=trim(_number) THEN RETURN to_jsonb(e); END IF;
 IF nullif(trim(_number),'') IS NULL OR length(_number)>100 OR e.invoiced_at IS NOT NULL OR e.rebill_mode='none' OR e.status::text='draft' OR e.eur_amount IS NULL OR e.tax_treatment='pending' OR e.tax_confirmed_at IS NULL OR e.payment_source_type='personal' AND e.approval_state<>'approved' THEN RAISE EXCEPTION 'Expense is not ready for invoicing'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_expense_invoice_allocations WHERE expense_id=e.id AND reversed_at IS NULL) THEN RAISE EXCEPTION 'Use existing invoice allocations for partially invoiced expenses'; END IF;
 b:=to_jsonb(e); PERFORM set_config('app.pe_action','1',true); PERFORM set_config('app.pm_expense_rpc','1',true);
 UPDATE public.pm_expenses SET invoiced_at=now(),invoice_reference=trim(_number) WHERE id=e.id RETURNING to_jsonb(pm_expenses.*) INTO a;
 PERFORM public.pe_event(e.id,'manualInvoiceReference',b,a,NULL,jsonb_build_object('invoiceNumber',trim(_number),'manualReferenceOnly',true));
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.fin_mark_expense_reimbursed(_expense uuid,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.pm_expenses; o public.finance_holder_reimbursements; b jsonb; batch uuid; allocation uuid; n numeric;
BEGIN
 SELECT * INTO e FROM public.pm_expenses WHERE id=_expense FOR UPDATE;
 IF NOT FOUND OR NOT public.fin_invoice_queue_access() OR NOT public.pe_finance_access(e.entity_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF; PERFORM public.pm_require_expense_area(e.id);
 IF e.workflow_version<>2 THEN RAISE EXCEPTION 'Historical adaptation requires separate approval'; END IF;
 IF _date IS NULL OR _date<DATE '2010-01-01' OR _date>(now() AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION 'Invalid reimbursement date'; END IF;
 IF e.status::text='paid' AND e.paid_at=_date THEN RETURN to_jsonb(e); END IF;
 IF e.payment_source_type<>'personal' OR e.approval_state<>'approved' OR e.eur_amount IS NULL OR e.reimburse_collaborator_id IS NULL THEN RAISE EXCEPTION 'Expense must be approved before reimbursement'; END IF;
 SELECT * INTO o FROM public.finance_holder_reimbursements WHERE project_expense_id=e.id FOR UPDATE;
 IF NOT FOUND OR o.status<>'owed' OR o.entity_id IS DISTINCT FROM e.entity_id OR o.collaborator_id IS DISTINCT FROM e.reimburse_collaborator_id THEN RAISE EXCEPTION 'Approved reimbursement obligation required'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_reimbursement_allocations WHERE obligation_id=o.id AND reversed_at IS NULL AND reserved_amount>settled_amount) THEN RAISE EXCEPTION 'Expense already reserved in a reimbursement batch'; END IF;
 SELECT o.amount-coalesce(sum(settled_amount),0) INTO n FROM public.project_reimbursement_allocations WHERE obligation_id=o.id AND reversed_at IS NULL;
 IF n IS NULL OR n<=0 THEN RAISE EXCEPTION 'Expense already reimbursed'; END IF;
 b:=to_jsonb(e);PERFORM set_config('app.pe_action','1',true);PERFORM set_config('app.pm_expense_rpc','1',true);
 INSERT INTO public.project_reimbursement_batches(entity_id,collaborator_id,reference,created_by) VALUES(e.entity_id,e.reimburse_collaborator_id,'MANUAL-'||left(e.id::text,8),auth.uid()) RETURNING id INTO batch;
 INSERT INTO public.project_reimbursement_allocations(batch_id,obligation_id,reserved_amount,settled_amount,actor) VALUES(batch,o.id,n,n,auth.uid()) RETURNING id INTO allocation;
 UPDATE public.finance_holder_reimbursements SET status='repaid',repaid_at=(_date::timestamp AT TIME ZONE 'Europe/Lisbon'),repaid_by=auth.uid() WHERE id=o.id;
 UPDATE public.pm_expenses SET status='paid',paid_at=_date WHERE id=e.id;
 PERFORM public.pe_event(e.id,'manualReimbursement',b,(SELECT to_jsonb(x) FROM public.pm_expenses x WHERE id=e.id),NULL,jsonb_build_object('batchId',batch,'allocationId',allocation,'amount',n,'reimbursedDate',_date,'bankReconciled',false));
 RETURN jsonb_build_object('id',e.id,'batchId',batch);
END $$;
REVOKE ALL ON FUNCTION public.fin_project_expense_lists(),public.fin_mark_expense_invoiced(uuid,text),public.fin_mark_expense_reimbursed(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_project_expense_lists(),public.fin_mark_expense_invoiced(uuid,text),public.fin_mark_expense_reimbursed(uuid,date) TO authenticated,service_role;
DO $patch$ DECLARE s text; BEGIN
 s:=pg_get_functiondef('public.pe_action(text,jsonb)'::regprocedure);
 IF position('IF _action=''save'' THEN' in s)=0 THEN RAISE EXCEPTION 'Missing expense save boundary'; END IF;
 s:=replace(s,'IF _action=''save'' THEN','IF _action=''save'' THEN IF e.invoiced_at IS NOT NULL THEN RAISE EXCEPTION ''Expense has a manually recorded invoice reference''; END IF;');
 IF position('ELSIF _action=''invoice'' THEN' in s)=0 THEN RAISE EXCEPTION 'Missing invoice action boundary'; END IF;
 s:=replace(s,'ELSIF _action=''invoice'' THEN','ELSIF _action=''invoice'' THEN IF e.invoiced_at IS NOT NULL THEN RAISE EXCEPTION ''Expense already has a manually recorded invoice reference''; END IF;');EXECUTE s;
END $patch$;