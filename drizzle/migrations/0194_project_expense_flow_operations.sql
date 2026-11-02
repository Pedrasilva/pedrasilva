CREATE FUNCTION public.pe_finance_access(_entity uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT is_psa_staff() AND fin_row_visible(_entity) AND (has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard')) $$;
CREATE FUNCTION public.pe_project_lead(_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT is_psa_staff() AND (has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM pm_project_team t JOIN pm_resources r ON r.id=t.resource_id JOIN collaborators c ON c.id=r.collaborator_id WHERE t.project_id=_project AND t.role='manager' AND r.active AND c.archived_at IS NULL AND c.id=get_my_collaborator_id())) $$;
REVOKE ALL ON FUNCTION public.pe_finance_access(uuid),public.pe_project_lead(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pe_finance_access(uuid),public.pe_project_lead(uuid) TO authenticated,service_role;
CREATE POLICY pe_lead_read ON public.pm_expenses FOR SELECT TO authenticated USING (workflow_version=2 AND is_psa_staff() AND (pe_project_lead(project_id) OR pe_finance_access(entity_id)));
CREATE FUNCTION public.pe_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN IF OLD.workflow_version=2 THEN RAISE EXCEPTION 'Use expense workflow actions'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.workflow_version=1 AND NEW.workflow_version<>1 THEN RAISE EXCEPTION 'Historical adaptation requires separate approval'; END IF;
 IF NEW.workflow_version=2 THEN
  IF coalesce(current_setting('app.pe_action',true),'')<>'1' THEN RAISE EXCEPTION 'Use expense workflow actions'; END IF;
  IF NEW.entity_id IS NULL OR NEW.original_currency IS NULL OR NEW.original_amount IS NULL OR NEW.original_amount<=0 OR coalesce(NEW.rebill_mode,'') NOT IN ('none','cost','markup') OR coalesce(NEW.tax_treatment,'') NOT IN ('pending','disbursement','reinvoiced_cost') THEN RAISE EXCEPTION 'Incomplete expense context'; END IF;
  IF NEW.payment_source_type='personal' AND NEW.reimburse_collaborator_id IS NULL THEN RAISE EXCEPTION 'Choose the collaborator who paid'; END IF;
  IF NEW.eur_amount IS NOT NULL AND NEW.eur_amount<=0 THEN RAISE EXCEPTION 'EUR amount must be positive'; END IF;
  IF NEW.eur_amount IS NOT NULL AND NEW.original_currency<>'EUR' AND (NEW.exchange_rate_source IS NULL OR NEW.exchange_rate_date IS NULL OR NEW.exchange_evidence IS NULL) THEN RAISE EXCEPTION 'Exchange evidence is required'; END IF;
  IF NEW.tax_treatment<>'pending' AND (NEW.tax_confirmed_at IS NULL OR NEW.tax_confirmed_by IS NULL) THEN RAISE EXCEPTION 'Tax treatment needs confirmation'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER aaa_pe_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pm_expenses FOR EACH ROW EXECUTE FUNCTION public.pe_guard();
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.pm_expenses_guard()'::regprocedure) INTO d; IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing expense guard'; END IF;
 EXECUTE replace(d,'BEGIN','BEGIN IF NEW.workflow_version=2 THEN RETURN NEW; END IF;');
 SELECT pg_get_functiondef('public.pm_expense_link_reimbursement(uuid)'::regprocedure) INTO d; IF position('IF NOT FOUND THEN' in d)=0 THEN RAISE EXCEPTION 'Missing bridge pattern'; END IF;
 EXECUTE replace(d,'IF NOT FOUND THEN','IF v_exp.workflow_version=2 THEN RETURN NULL; END IF; IF NOT FOUND THEN');
 SELECT pg_get_functiondef('public.fin_personal_card_decision_act()'::regprocedure) INTO d; IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing personal card guard'; END IF;
 EXECUTE replace(d,'BEGIN','BEGIN IF NEW.project_expense_id IS NOT NULL THEN RETURN NEW; END IF;');
END $$;
CREATE FUNCTION public.pe_obligation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.project_expense_id IS NOT NULL AND coalesce(current_setting('app.pe_action',true),'')<>'1' THEN RAISE EXCEPTION 'Project reimbursements require approval and reconciled transfer'; END IF; RETURN NEW; END $$;
CREATE TRIGGER aaa_pe_obligation_guard BEFORE INSERT OR UPDATE ON public.finance_holder_reimbursements FOR EACH ROW EXECUTE FUNCTION public.pe_obligation_guard();
CREATE FUNCTION public.pe_event(_expense uuid,_action text,_before jsonb,_after jsonb,_reason text DEFAULT NULL,_evidence jsonb DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ INSERT INTO project_expense_events(expense_id,action,before_value,after_value,reason,evidence,actor) VALUES(_expense,_action,_before,_after,_reason,_evidence,auth.uid()) $$;
REVOKE ALL ON FUNCTION public.pe_event(uuid,text,jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pe_obligation_sync(_expense uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e pm_expenses; BEGIN SELECT * INTO e FROM pm_expenses WHERE id=_expense; IF e.workflow_version<>2 THEN RETURN; END IF;
 IF e.payment_source_type='personal' AND e.approval_state='approved' AND e.eur_amount IS NOT NULL THEN
 INSERT INTO finance_holder_reimbursements(entity_id,project_expense_id,document_id,collaborator_id,holder_name,amount,status,approved_by,approved_at,created_by) VALUES(e.entity_id,e.id,e.purchase_document_id,e.reimburse_collaborator_id,(SELECT nome FROM collaborators WHERE id=e.reimburse_collaborator_id),e.eur_amount,'owed',e.approval_decided_by,e.approval_decided_at,auth.uid())
 ON CONFLICT(project_expense_id) WHERE project_expense_id IS NOT NULL DO UPDATE SET document_id=excluded.document_id,amount=excluded.amount,status='owed',approved_by=excluded.approved_by,approved_at=excluded.approved_at;
 ELSE UPDATE finance_holder_reimbursements SET status='cancelled' WHERE project_expense_id=e.id AND status='owed'; END IF; END $$;
REVOKE ALL ON FUNCTION public.pe_obligation_sync(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pe_reconciled_amount(_tx uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path=public AS $$ SELECT coalesce(sum(settled_amount),0) FROM project_reimbursement_allocations WHERE bank_transaction_id=_tx AND reversed_at IS NULL $$;
REVOKE ALL ON FUNCTION public.pe_reconciled_amount(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pe_reconciled_amount(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fin_tx_open_balance(_tx_id uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path=public AS $$ SELECT round(abs(t.amount)-coalesce((SELECT sum(p.amount) FROM financial_document_payments p WHERE p.bank_transaction_id=t.id),0)-pe_reconciled_amount(t.id),2) FROM bank_transactions t WHERE t.id=_tx_id $$;
CREATE FUNCTION public.pe_action(_action text,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e pm_expenses; olde jsonb; eid uuid:=nullif(_data->>'expenseId','')::uuid; pid uuid; ent uuid; bid uuid; lead uuid; b project_reimbursement_batches; o finance_holder_reimbursements; a project_reimbursement_allocations; tx bank_transactions; l financial_document_lines; d financial_documents; ip financial_document_payments; ia project_expense_invoice_allocations; n numeric; remaining numeric; reason text:=nullif(btrim(_data->>'reason'),''); x jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT is_psa_staff() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM set_config('app.pe_action','1',true); PERFORM set_config('app.pm_expense_rpc','1',true);
 IF eid IS NOT NULL THEN SELECT * INTO e FROM pm_expenses WHERE id=eid FOR UPDATE; IF NOT FOUND OR e.workflow_version<>2 THEN RAISE EXCEPTION 'New-flow expense not found'; END IF; olde:=to_jsonb(e); END IF;
 IF _action='save' THEN
 pid:=coalesce(e.project_id,nullif(_data->>'projectId','')::uuid); ent:=coalesce(e.entity_id,'00000000-0000-4000-a000-000000000001'::uuid);
 IF pid IS NULL OR NOT EXISTS(SELECT 1 FROM pm_projects WHERE id=pid AND NOT finance_only) THEN RAISE EXCEPTION 'Choose a project'; END IF;
 IF NOT (pe_finance_access(ent) OR pm_has_assigned_access(auth.uid(),pid)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF eid IS NOT NULL THEN
 IF e.submitted_by<>auth.uid() AND NOT pe_finance_access(ent) THEN RAISE EXCEPTION 'Only the submitter can edit'; END IF;
 IF EXISTS(SELECT 1 FROM project_expense_invoice_allocations WHERE expense_id=eid AND reversed_at IS NULL) OR EXISTS(SELECT 1 FROM project_reimbursement_allocations a JOIN finance_holder_reimbursements o ON o.id=a.obligation_id WHERE o.project_expense_id=eid AND a.reversed_at IS NULL) THEN RAISE EXCEPTION 'Reverse allocations before changing expense'; END IF;
 IF e.purchase_document_id IS NOT NULL THEN RAISE EXCEPTION 'Confirmed receipt changes require finance review'; END IF;
 END IF;
 IF nullif(_data->>'description','') IS NULL THEN RAISE EXCEPTION 'Description required'; END IF;
 IF coalesce(_data->>'taxTreatment','pending')<>'pending' AND NOT pe_finance_access(ent) THEN RAISE EXCEPTION 'Finance must confirm tax treatment'; END IF;
 IF (_data->>'originalAmount')::numeric<=0 OR coalesce((_data->>'markupPct')::numeric,0)<0 THEN RAISE EXCEPTION 'Invalid expense amount'; END IF;
 IF eid IS NULL THEN
 INSERT INTO pm_expenses(project_id,entity_id,workflow_version,description,original_currency,original_amount,rebill_mode,tax_treatment,payment_source_type,reimburse_collaborator_id,eur_amount,exchange_rate_source,exchange_rate_date,exchange_evidence,tax_confirmed_by,tax_confirmed_at)
 VALUES(pid,ent,2,_data->>'description',upper(_data->>'currency'),(_data->>'originalAmount')::numeric,coalesce(_data->>'rebillMode','none'),'pending',coalesce(_data->>'paidBy','personal'),nullif(_data->>'collaboratorId','')::uuid,NULL,NULL,NULL,NULL,NULL,NULL) RETURNING pm_expenses.id INTO eid;
 END IF;
 UPDATE pm_expenses SET description=_data->>'description',category=coalesce(_data->>'category','travel')::pm_expense_category,vendor=nullif(_data->>'supplier',''),document_number=nullif(_data->>'documentNumber',''),incurred_at=nullif(_data->>'date','')::date,expense_date=nullif(_data->>'date','')::date,
 original_currency=upper(_data->>'currency'),original_amount=(_data->>'originalAmount')::numeric,
 eur_amount=CASE WHEN upper(_data->>'currency')='EUR' THEN (_data->>'originalAmount')::numeric ELSE nullif(_data->>'eurAmount','')::numeric END,purchase_price=CASE WHEN upper(_data->>'currency')='EUR' THEN (_data->>'originalAmount')::numeric ELSE coalesce(nullif(_data->>'eurAmount','')::numeric,0) END,
 exchange_rate=CASE WHEN upper(_data->>'currency')='EUR' THEN 1 ELSE nullif(_data->>'eurAmount','')::numeric/nullif((_data->>'originalAmount')::numeric,0) END,exchange_rate_date=nullif(_data->>'exchangeDate','')::date,exchange_rate_source=nullif(_data->>'exchangeSource',''),exchange_evidence=_data->'exchangeEvidence',
 payment_source_type=coalesce(_data->>'paidBy','personal'),payment_card_id=nullif(_data->>'cardId','')::uuid,paid_from_account_id=nullif(_data->>'accountId','')::uuid,reimburse_collaborator_id=CASE WHEN coalesce(_data->>'paidBy','personal')='personal' THEN nullif(_data->>'collaboratorId','')::uuid END,reimbursable=coalesce(_data->>'paidBy','personal')='personal',
 rebill_mode=coalesce(_data->>'rebillMode','none'),rebillable=coalesce(_data->>'rebillMode','none')<>'none',markup_pct=coalesce(nullif(_data->>'markupPct','')::numeric,0),tax_treatment=coalesce(_data->>'taxTreatment','pending'),tax_parameters=_data->'taxParameters',tax_confirmed_by=CASE WHEN coalesce(_data->>'taxTreatment','pending')<>'pending' THEN auth.uid() END,tax_confirmed_at=CASE WHEN coalesce(_data->>'taxTreatment','pending')<>'pending' THEN now() END,
 notes=nullif(_data->>'notes',''),receipt_path=coalesce(nullif(_data->>'receiptPath',''),receipt_path),status='draft',approval_state='not_required',approval_decided_by=NULL,approval_decided_at=NULL,approval_note=NULL,expense_revision=expense_revision+1 WHERE pm_expenses.id=eid;
 SELECT * INTO e FROM pm_expenses WHERE pm_expenses.id=eid;
 IF e.payment_source_type NOT IN ('personal','company_card','company_account') THEN RAISE EXCEPTION 'Invalid payment source'; END IF;
 IF e.payment_source_type='company_card' AND NOT EXISTS(SELECT 1 FROM payment_cards WHERE id=e.payment_card_id AND entity_id=ent AND active AND NOT is_personal) THEN RAISE EXCEPTION 'Choose a company card'; END IF;
 IF e.payment_source_type='company_account' AND NOT EXISTS(SELECT 1 FROM bank_accounts WHERE id=e.paid_from_account_id AND entity_id=ent AND active) THEN RAISE EXCEPTION 'Choose a company account'; END IF;
 PERFORM pe_obligation_sync(eid); PERFORM pe_event(eid,'save',olde,to_jsonb(e),reason);
 ELSIF _action='submit' THEN
 IF e.submitted_by<>auth.uid() AND NOT pe_finance_access(e.entity_id) THEN RAISE EXCEPTION 'Only the submitter can request approval'; END IF;
 IF e.status<>'draft' OR e.approval_state='pending' THEN RAISE EXCEPTION 'Expense is not a draft'; END IF;
 SELECT r.collaborator_id INTO lead FROM pm_project_team t JOIN pm_resources r ON r.id=t.resource_id JOIN collaborators c ON c.id=r.collaborator_id WHERE t.project_id=e.project_id AND t.role='manager' AND r.active AND c.archived_at IS NULL ORDER BY t.created_at LIMIT 1;
 UPDATE pm_expenses SET status='submitted',approval_state=CASE WHEN payment_source_type='personal' THEN 'pending' ELSE 'not_required' END,approval_requested_from=lead,approval_requested_at=now() WHERE pm_expenses.id=eid;
 PERFORM pe_event(eid,'submit',olde,(SELECT to_jsonb(z) FROM pm_expenses z WHERE z.id=eid));
 INSERT INTO notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) SELECT u.user_id,'expense_approval_requested','Despesa para aprovar · Expense to approve',e.description,'/projects/'||e.project_id||'?tab=expenses','projects','pm_expense',eid,'pe-submit:'||eid||':'||e.expense_revision FROM user_roles u WHERE u.role='admin' AND u.user_id<>auth.uid() ON CONFLICT(user_id,dedupe_key) DO NOTHING;
 ELSIF _action='decide' THEN
 IF NOT pe_project_lead(e.project_id) OR e.approval_state<>'pending' THEN RAISE EXCEPTION 'Only the project lead can decide pending expenses'; END IF;
 IF NOT coalesce((_data->>'approve')::boolean,false) AND reason IS NULL THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
 UPDATE pm_expenses SET approval_state=CASE WHEN (_data->>'approve')::boolean THEN 'approved' ELSE 'rejected' END,status=CASE WHEN (_data->>'approve')::boolean THEN 'approved'::pm_expense_status ELSE 'draft'::pm_expense_status END,approval_decided_by=auth.uid(),approval_decided_at=now(),approval_note=reason WHERE pm_expenses.id=eid;
 PERFORM pe_obligation_sync(eid); PERFORM pe_event(eid,'decide',olde,(SELECT to_jsonb(z) FROM pm_expenses z WHERE z.id=eid),reason);
 ELSIF _action='batch' THEN
 ent:=current_finance_entity(); IF NOT pe_finance_access(ent) THEN RAISE EXCEPTION 'Forbidden'; END IF; bid:=gen_random_uuid(); pid:=nullif(_data->>'collaboratorId','')::uuid;
 INSERT INTO project_reimbursement_batches(id,entity_id,collaborator_id,reference,created_by) VALUES(bid,ent,pid,'REIM-'||left(bid::text,8),auth.uid());
 IF jsonb_array_length(_data->'obligationIds')=0 THEN RAISE EXCEPTION 'Choose expenses'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(_data->'obligationIds') LOOP
 SELECT * INTO o FROM finance_holder_reimbursements WHERE finance_holder_reimbursements.id=(x#>>'{}')::uuid FOR UPDATE;
 IF NOT FOUND OR o.entity_id<>ent OR o.collaborator_id IS DISTINCT FROM pid OR o.project_expense_id IS NULL OR o.status<>'owed' THEN RAISE EXCEPTION 'Batch must contain approved expenses for one person and entity'; END IF;
 SELECT * INTO e FROM pm_expenses WHERE pm_expenses.id=o.project_expense_id FOR UPDATE; IF e.approval_state<>'approved' THEN RAISE EXCEPTION 'Expense not approved'; END IF;
 n:=o.amount-coalesce((SELECT sum(reserved_amount) FROM project_reimbursement_allocations WHERE obligation_id=o.id AND reversed_at IS NULL),0); IF n<=0 THEN RAISE EXCEPTION 'Expense already allocated'; END IF;
 INSERT INTO project_reimbursement_allocations(batch_id,obligation_id,reserved_amount,actor) VALUES(bid,o.id,n,auth.uid()); PERFORM pe_event(e.id,'batch',NULL,jsonb_build_object('batchId',bid,'amount',n)); END LOOP; RETURN jsonb_build_object('id',bid);
 ELSIF _action='settleBatch' THEN
 SELECT * INTO b FROM project_reimbursement_batches WHERE project_reimbursement_batches.id=(_data->>'batchId')::uuid FOR UPDATE; IF NOT FOUND OR NOT pe_finance_access(b.entity_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO tx FROM bank_transactions WHERE bank_transactions.id=(_data->>'transactionId')::uuid FOR UPDATE; IF NOT FOUND OR tx.entity_id<>b.entity_id OR tx.amount>=0 OR fin_bank_tx_in_locked_period(tx.id) THEN RAISE EXCEPTION 'Invalid or locked outgoing transfer'; END IF;
 n:=(_data->>'amount')::numeric; IF n<=0 OR n>fin_tx_open_balance(tx.id) THEN RAISE EXCEPTION 'Amount exceeds movement balance'; END IF;
 IF n>coalesce((SELECT sum(reserved_amount-settled_amount) FROM project_reimbursement_allocations WHERE batch_id=b.id AND reversed_at IS NULL),0) THEN RAISE EXCEPTION 'Amount exceeds batch balance'; END IF; remaining:=n;
 FOR a IN SELECT * FROM project_reimbursement_allocations WHERE batch_id=b.id AND reversed_at IS NULL AND settled_amount=0 ORDER BY id FOR UPDATE LOOP
 SELECT * INTO o FROM finance_holder_reimbursements WHERE finance_holder_reimbursements.id=a.obligation_id FOR UPDATE; SELECT * INTO e FROM pm_expenses WHERE pm_expenses.id=o.project_expense_id FOR UPDATE; IF e.approval_state<>'approved' THEN RAISE EXCEPTION 'Expense not approved'; END IF;
 n:=least(remaining,a.reserved_amount); UPDATE project_reimbursement_allocations SET reserved_amount=n,settled_amount=n,bank_transaction_id=tx.id WHERE project_reimbursement_allocations.id=a.id;
 IF n<a.reserved_amount THEN INSERT INTO project_reimbursement_allocations(batch_id,obligation_id,reserved_amount,actor) VALUES(b.id,o.id,a.reserved_amount-n,auth.uid()); END IF;
 IF coalesce((SELECT sum(settled_amount) FROM project_reimbursement_allocations WHERE obligation_id=o.id AND reversed_at IS NULL),0)>=o.amount THEN UPDATE finance_holder_reimbursements SET status='repaid',repaid_at=now(),repaid_by=auth.uid() WHERE finance_holder_reimbursements.id=o.id; UPDATE pm_expenses SET status='paid',paid_at=tx.transaction_date WHERE pm_expenses.id=e.id; END IF;
 PERFORM pe_event(e.id,'reimburse',NULL,jsonb_build_object('batchId',b.id,'transactionId',tx.id,'amount',n),reason,jsonb_build_object('bankTransaction',tx.id)); remaining:=remaining-n; EXIT WHEN remaining<=0; END LOOP;
 IF fin_tx_open_balance(tx.id)<=0.005 THEN UPDATE bank_transactions SET status='reconciled',reconciled_at=now(),reconciled_by=auth.uid() WHERE bank_transactions.id=tx.id; END IF;
 ELSIF _action='invoice' THEN
 IF NOT pe_finance_access(e.entity_id) OR e.rebill_mode='none' OR e.status='draft' OR (e.payment_source_type='personal' AND e.approval_state<>'approved') OR e.tax_treatment='pending' OR e.eur_amount IS NULL THEN RAISE EXCEPTION 'Expense is not ready for invoicing'; END IF;
 SELECT * INTO l FROM financial_document_lines WHERE financial_document_lines.id=(_data->>'lineId')::uuid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Invoice line not found'; END IF; SELECT * INTO d FROM financial_documents WHERE financial_documents.id=l.document_id FOR UPDATE;
 IF d.entity_id<>e.entity_id OR d.direction<>'issued' OR d.doc_type<>'client_invoice' OR d.status='cancelled' OR l.project_id IS DISTINCT FROM e.project_id OR d.counterparty_client_id IS DISTINCT FROM (SELECT company_id FROM pm_projects WHERE pm_projects.id=e.project_id) OR d.counterparty_client_id IS NULL THEN RAISE EXCEPTION 'Invoice line must belong to the project client'; END IF;
 n:=(_data->>'costAmount')::numeric; remaining:=round(n*CASE WHEN e.rebill_mode='markup' THEN 1+e.markup_pct/100 ELSE 1 END,2);
 IF n<=0 OR n+coalesce((SELECT sum(cost_amount) FROM project_expense_invoice_allocations WHERE expense_id=e.id AND reversed_at IS NULL),0)>e.eur_amount THEN RAISE EXCEPTION 'Expense already allocated'; END IF;
 IF remaining+coalesce((SELECT sum(billed_amount) FROM project_expense_invoice_allocations WHERE line_id=l.id AND reversed_at IS NULL),0)>coalesce(l.amount_ex_vat,l.quantity*l.unit_price_ex_vat) THEN RAISE EXCEPTION 'Amount exceeds invoice line'; END IF;
 INSERT INTO project_expense_invoice_allocations(expense_id,line_id,cost_amount,billed_amount,vat_amount,tax_treatment,actor) VALUES(e.id,l.id,n,remaining,coalesce((_data->>'vatAmount')::numeric,0),e.tax_treatment,auth.uid()); PERFORM pe_event(e.id,'invoice',NULL,jsonb_build_object('lineId',l.id,'cost',n,'billed',remaining));
 ELSIF _action='receipt' THEN
 SELECT * INTO ia FROM project_expense_invoice_allocations WHERE project_expense_invoice_allocations.id=(_data->>'allocationId')::uuid AND reversed_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Allocation not found'; END IF; SELECT * INTO e FROM pm_expenses WHERE pm_expenses.id=ia.expense_id FOR UPDATE; IF NOT pe_finance_access(e.entity_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO l FROM financial_document_lines WHERE financial_document_lines.id=ia.line_id; SELECT * INTO ip FROM financial_document_payments WHERE financial_document_payments.id=(_data->>'paymentId')::uuid FOR UPDATE; IF NOT FOUND OR ip.document_id IS DISTINCT FROM l.document_id OR ip.amount<=0 THEN RAISE EXCEPTION 'Choose an actual invoice payment'; END IF;
 n:=(_data->>'amount')::numeric; IF n<=0 OR n+coalesce((SELECT sum(amount) FROM project_expense_receipt_allocations WHERE payment_id=ip.id AND reversed_at IS NULL),0)>ip.amount OR n+coalesce((SELECT sum(amount) FROM project_expense_receipt_allocations WHERE invoice_allocation_id=ia.id AND reversed_at IS NULL),0)>ia.billed_amount+ia.vat_amount THEN RAISE EXCEPTION 'Amount exceeds payment or allocation'; END IF;
 INSERT INTO project_expense_receipt_allocations(invoice_allocation_id,payment_id,amount,actor) VALUES(ia.id,ip.id,n,auth.uid()); PERFORM pe_event(e.id,'clientReceipt',NULL,jsonb_build_object('paymentId',ip.id,'amount',n));
 ELSIF _action='reverseReimbursement' THEN
 IF reason IS NULL THEN RAISE EXCEPTION 'Reversal reason required'; END IF;
 SELECT * INTO a FROM project_reimbursement_allocations WHERE project_reimbursement_allocations.id=(_data->>'allocationId')::uuid AND reversed_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Allocation not found'; END IF; SELECT * INTO b FROM project_reimbursement_batches WHERE project_reimbursement_batches.id=a.batch_id FOR UPDATE; IF NOT pe_finance_access(b.entity_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF a.bank_transaction_id IS NOT NULL THEN SELECT * INTO tx FROM bank_transactions WHERE bank_transactions.id=a.bank_transaction_id FOR UPDATE; IF fin_bank_tx_in_locked_period(tx.id) THEN RAISE EXCEPTION 'Period is locked'; END IF; END IF;
 UPDATE project_reimbursement_allocations SET reversed_at=now(),reversed_by=auth.uid(),reversal_reason=reason WHERE project_reimbursement_allocations.id=a.id; SELECT * INTO o FROM finance_holder_reimbursements WHERE finance_holder_reimbursements.id=a.obligation_id FOR UPDATE;
 UPDATE finance_holder_reimbursements SET status='owed',repaid_at=NULL,repaid_by=NULL WHERE finance_holder_reimbursements.id=o.id; UPDATE pm_expenses SET status='approved',paid_at=NULL WHERE pm_expenses.id=o.project_expense_id;
 IF a.bank_transaction_id IS NOT NULL THEN UPDATE bank_transactions SET status='unclassified',reconciled_at=NULL,reconciled_by=NULL WHERE bank_transactions.id=tx.id; END IF; PERFORM pe_event(o.project_expense_id,'reverseReimbursement',to_jsonb(a),NULL,reason);
 ELSIF _action IN ('reverseInvoice','reverseReceipt') THEN
 IF reason IS NULL THEN RAISE EXCEPTION 'Reversal reason required'; END IF;
 IF _action='reverseReceipt' THEN SELECT invoice_allocation_id INTO bid FROM project_expense_receipt_allocations WHERE id=(_data->>'allocationId')::uuid AND reversed_at IS NULL FOR UPDATE; ELSE bid:=(_data->>'allocationId')::uuid; END IF;
 SELECT * INTO ia FROM project_expense_invoice_allocations WHERE project_expense_invoice_allocations.id=bid AND reversed_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Allocation not found'; END IF; SELECT * INTO e FROM pm_expenses WHERE pm_expenses.id=ia.expense_id FOR UPDATE; IF NOT pe_finance_access(e.entity_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _action='reverseInvoice' THEN IF EXISTS(SELECT 1 FROM project_expense_receipt_allocations WHERE invoice_allocation_id=ia.id AND reversed_at IS NULL) THEN RAISE EXCEPTION 'Reverse receipts before invoice allocation'; END IF; UPDATE project_expense_invoice_allocations SET reversed_at=now(),reversed_by=auth.uid(),reversal_reason=reason WHERE project_expense_invoice_allocations.id=ia.id;
 ELSE UPDATE project_expense_receipt_allocations SET reversed_at=now(),reversed_by=auth.uid(),reversal_reason=reason WHERE id=(_data->>'allocationId')::uuid; END IF; PERFORM pe_event(e.id,_action,to_jsonb(ia),NULL,reason);
 ELSE RAISE EXCEPTION 'Unknown expense action'; END IF;
 PERFORM set_config('app.pe_action','',true); PERFORM set_config('app.pm_expense_rpc','',true); RETURN jsonb_build_object('id',coalesce(eid,e.id));
END $$;
REVOKE ALL ON FUNCTION public.pe_action(text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pe_action(text,jsonb) TO authenticated;