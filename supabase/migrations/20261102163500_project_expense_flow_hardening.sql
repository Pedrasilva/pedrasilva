CREATE OR REPLACE FUNCTION public.pe_action(_action text, _data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 IF e.purchase_document_id IS NOT NULL AND NOT pe_finance_access(ent) THEN RAISE EXCEPTION 'Confirmed receipt changes require finance review'; END IF;
 END IF;
 IF nullif(_data->>'description','') IS NULL THEN RAISE EXCEPTION 'Description required'; END IF;
 IF coalesce(_data->>'taxTreatment','pending')<>'pending' AND NOT pe_finance_access(ent) THEN RAISE EXCEPTION 'Finance must confirm tax treatment'; END IF;
 IF coalesce(_data->>'paidBy','personal')='personal' AND NOT EXISTS(SELECT 1 FROM collaborators WHERE id=nullif(_data->>'collaboratorId','')::uuid AND archived_at IS NULL) THEN RAISE EXCEPTION 'Choose an active collaborator'; END IF;
 IF coalesce(_data->>'paidBy','personal')='personal' AND nullif(_data->>'collaboratorId','')::uuid IS DISTINCT FROM get_my_collaborator_id() AND NOT pe_finance_access(ent) THEN RAISE EXCEPTION 'Only Finance can record another payer'; END IF;
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
 IF e.payment_source_type='company_account' AND NOT EXISTS(SELECT 1 FROM bank_accounts WHERE id=e.paid_from_account_id AND entity_id=ent AND is_active AND archived_at IS NULL) THEN RAISE EXCEPTION 'Choose a company account'; END IF;
 PERFORM pe_obligation_sync(eid); PERFORM pe_event(eid,'save',olde,to_jsonb(e),reason);
 ELSIF _action='submit' THEN
 IF e.submitted_by<>auth.uid() AND NOT pe_finance_access(e.entity_id) THEN RAISE EXCEPTION 'Only the submitter can request approval'; END IF;
 IF e.status<>'draft' OR e.approval_state='pending' THEN RAISE EXCEPTION 'Expense is not a draft'; END IF;
 SELECT r.collaborator_id INTO lead FROM pm_project_team t JOIN pm_resources r ON r.id=t.resource_id JOIN collaborators c ON c.id=r.collaborator_id WHERE t.project_id=e.project_id AND t.role='manager' AND r.active AND c.archived_at IS NULL ORDER BY t.created_at LIMIT 1;
 UPDATE pm_expenses SET status='submitted',approval_state=CASE WHEN payment_source_type='personal' THEN 'pending' ELSE 'not_required' END,approval_requested_from=lead,approval_requested_at=now() WHERE pm_expenses.id=eid;
 PERFORM pe_event(eid,'submit',olde,(SELECT to_jsonb(z) FROM pm_expenses z WHERE z.id=eid));
 INSERT INTO notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) SELECT p.id,'expense_approval_requested','Despesa para aprovar · Expense to approve',e.description,'/projects/'||e.project_id||'?tab=expenses','projects','pm_expense',eid,'pe-lead-submit:'||eid||':'||e.expense_revision FROM auth.users p JOIN collaborators lc ON lc.email=p.email WHERE lc.id=lead AND p.id<>auth.uid() ON CONFLICT(user_id,dedupe_key) DO NOTHING; INSERT INTO notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) SELECT u.user_id,'expense_approval_requested','Despesa para aprovar · Expense to approve',e.description,'/projects/'||e.project_id||'?tab=expenses','projects','pm_expense',eid,'pe-submit:'||eid||':'||e.expense_revision FROM user_roles u WHERE u.role='admin' AND u.user_id<>auth.uid() ON CONFLICT(user_id,dedupe_key) DO NOTHING;
 ELSIF _action='decide' THEN
 IF (e.submitted_by=auth.uid() OR e.reimburse_collaborator_id=get_my_collaborator_id()) AND NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Another approver must decide your expense'; END IF;
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
 IF coalesce((_data->>'vatAmount')::numeric,0)<0 OR coalesce((_data->>'vatAmount')::numeric,0)+coalesce((SELECT sum(vat_amount) FROM project_expense_invoice_allocations WHERE line_id=l.id AND reversed_at IS NULL),0)>coalesce(l.vat_amount,0) THEN RAISE EXCEPTION 'VAT exceeds invoice line'; END IF;
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
 IF _action='decide' AND has_role(auth.uid(),'admin') AND (e.submitted_by=auth.uid() OR e.reimburse_collaborator_id=get_my_collaborator_id()) THEN PERFORM pe_event(e.id,'adminApprovalOverride',NULL,jsonb_build_object('selfApproval',true),reason); END IF;
 PERFORM set_config('app.pe_action','',true); PERFORM set_config('app.pm_expense_rpc','',true); RETURN jsonb_build_object('id',coalesce(eid,e.id));
END $function$

;
CREATE OR REPLACE FUNCTION public.fin_reconcile_candidates(_tx_id uuid, _search text DEFAULT NULL::text)
 RETURNS TABLE(kind text, ref_id uuid, label text, counterparty text, doc_date date, amount numeric, outstanding numeric, detail text, origin text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.bank_transactions%ROWTYPE;
  s text := NULLIF(btrim(COALESCE(_search, '')), '');
  n numeric;
  v_open numeric;
BEGIN
  SELECT * INTO t FROM public.bank_transactions WHERE id = _tx_id;
  IF NOT FOUND THEN RETURN; END IF;
  BEGIN n := replace(s, ',', '.')::numeric; EXCEPTION WHEN OTHERS THEN n := NULL; END;
  v_open := COALESCE(public.fin_tx_open_balance(_tx_id), abs(t.amount));

  RETURN QUERY
  SELECT c.kind, c.ref_id, c.label, c.counterparty, c.doc_date, c.amount, c.outstanding, c.detail, c.origin FROM (
    SELECT (CASE WHEN d.direction::text = 'issued' THEN 'sale' ELSE 'purchase' END)::text AS kind,
           d.id AS ref_id, COALESCE(d.document_number, '—')::text AS label, d.counterparty_name_snapshot::text AS counterparty,
           d.issue_date AS doc_date, d.total_inc_vat::numeric AS amount, d.outstanding_amount::numeric AS outstanding, d.doc_type::text AS detail,
           (CASE WHEN d.direction::text = 'issued' THEN 'sale' WHEN d.project_id IS NOT NULL THEN 'project' ELSE 'purchase' END)::text AS origin
      FROM public.financial_documents d
     WHERE d.entity_id = t.entity_id
       AND d.status::text NOT IN ('cancelled','paid')
       AND COALESCE(d.outstanding_amount, 0) > 0
       AND d.direction::text = CASE WHEN t.amount > 0 THEN 'issued' ELSE 'received' END AND NOT EXISTS(SELECT 1 FROM pm_expenses e WHERE e.id=d.project_expense_id AND e.payment_source_type='personal')
       AND (s IS NULL
            OR d.document_number ILIKE '%' || s || '%'
            OR d.counterparty_name_snapshot ILIKE '%' || s || '%'
            OR d.notes ILIKE '%' || s || '%'
            OR (n IS NOT NULL AND (abs(d.total_inc_vat - n) < 0.01 OR abs(d.outstanding_amount - n) < 0.01)))
    UNION ALL
    (SELECT DISTINCT ON (lower(COALESCE(q.extracted_supplier_name, '')), COALESCE(q.extracted_document_number, q.original_filename), q.extracted_amount)
           'entrada'::text, q.id, COALESCE(q.extracted_document_number, q.original_filename, '—')::text,
           COALESCE(q.extracted_supplier_name, q.extracted_buyer_name)::text, q.extracted_date, q.extracted_amount::numeric, q.extracted_amount::numeric,
           q.intake_route::text, 'entrada'::text
      FROM public.financial_document_review_queue q
     WHERE q.entity_id = t.entity_id
       AND q.status::text = 'pending_review'
       AND COALESCE(q.intake_route::text, '') <> 'bank'
       AND q.created_expense_id IS NULL AND q.duplicate_of_document_id IS NULL AND NOT EXISTS(SELECT 1 FROM pm_expenses e WHERE e.id=q.source_project_expense_id AND e.workflow_version=2 AND e.payment_source_type='personal')
       AND COALESCE(q.direction::text, 'unclear') IN ('unclear', CASE WHEN t.amount > 0 THEN 'issued' ELSE 'received' END)
       AND (s IS NULL
            OR q.extracted_document_number ILIKE '%' || s || '%'
            OR q.extracted_supplier_name ILIKE '%' || s || '%'
            OR q.extracted_buyer_name ILIKE '%' || s || '%'
            OR q.original_filename ILIKE '%' || s || '%'
            OR (n IS NOT NULL AND abs(COALESCE(q.extracted_amount, -1) - n) < 0.01))
     ORDER BY lower(COALESCE(q.extracted_supplier_name, '')), COALESCE(q.extracted_document_number, q.original_filename), q.extracted_amount, q.created_at)
    UNION ALL
    SELECT 'reimbursement'::text, r.id, COALESCE(r.holder_name, '—')::text, r.holder_name::text, r.created_at::date,
           r.amount::numeric, r.amount::numeric, r.status::text, 'hr'::text
      FROM public.finance_holder_reimbursements r
     WHERE t.amount < 0 AND r.entity_id = t.entity_id AND r.status NOT IN ('repaid','cancelled') AND r.project_expense_id IS NULL
       AND (s IS NULL OR r.holder_name ILIKE '%' || s || '%' OR (n IS NOT NULL AND abs(r.amount - n) < 0.01))
    UNION ALL SELECT 'reimbursement_batch'::text,b.id,b.reference::text,c.nome::text,b.created_at::date,sum(a.reserved_amount)::numeric,sum(a.reserved_amount-a.settled_amount)::numeric,NULL::text,'reimbursement'::text FROM project_reimbursement_batches b JOIN project_reimbursement_allocations a ON a.batch_id=b.id AND a.reversed_at IS NULL JOIN collaborators c ON c.id=b.collaborator_id WHERE t.amount<0 AND b.entity_id=t.entity_id AND (s IS NULL OR c.nome ILIKE '%'||s||'%' OR b.reference ILIKE '%'||s||'%') GROUP BY b.id,c.nome HAVING sum(a.reserved_amount-a.settled_amount)>0 UNION ALL
    SELECT 'transfer'::text, o.id, a.account_name::text, a.bank_name::text, o.transaction_date, o.amount::numeric, NULL::numeric, o.description::text, 'transfer'::text
      FROM public.bank_transactions o
      JOIN public.bank_accounts a ON a.id = o.bank_account_id
     WHERE o.bank_account_id <> t.bank_account_id
       AND abs(o.amount + t.amount) < 0.01
       AND o.transaction_date BETWEEN t.transaction_date - 5 AND t.transaction_date + 5
       AND (s IS NULL OR o.description ILIKE '%' || s || '%' OR a.account_name ILIKE '%' || s || '%' OR n IS NOT NULL)
  ) c
  ORDER BY abs(abs(COALESCE(c.outstanding, c.amount, 0)) - v_open),
           abs(COALESCE(c.doc_date, t.transaction_date) - t.transaction_date)
  LIMIT 300;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.fin_confirm_queue_item(_id uuid, _edits jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  r public.financial_document_review_queue;
  e jsonb := coalesce(_edits, '{}'::jsonb);
  issued boolean;
  cid uuid; vat text; vat_clean text; cname text; ex record; created boolean := false; linked boolean := false;
  cls record; ai_code text; blk text[]; doc_id uuid; total numeric; vatamt numeric; wh numeric;
  cp_name text; cat record; d date; it jsonb; i int; qty numeric; amt numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF r.entity_id IS DISTINCT FROM public.current_finance_entity() OR NOT public.has_entity_access(r.entity_id)
     OR NOT (public.has_role(uid, 'admin') OR public.has_permission(uid, 'finance.dashboard')) THEN
    RAISE EXCEPTION 'Forbidden: finance access required for this entity' USING ERRCODE = '42501';
  END IF;
  IF r.status::text <> 'pending_review' THEN RAISE EXCEPTION 'BLOCKED:status'; END IF;
  issued := r.direction = 'issued';

  -- 1) field edits
  IF e ?| ARRAY['supplier_name','supplier_vat','document_number','date','amount','vat','withholding','currency',
                'payment_method','card_last4','paid_from_card_id','paid_from_account_id','marked_unpaid',
                'classification_id','project_id','assigned_collaborator_id'] THEN
    UPDATE public.financial_document_review_queue q SET
      extracted_supplier_name = CASE WHEN NOT issued AND e ? 'supplier_name' THEN nullif(e->>'supplier_name','') ELSE q.extracted_supplier_name END,
      extracted_seller_name   = CASE WHEN NOT issued AND e ? 'supplier_name' THEN nullif(e->>'supplier_name','') ELSE q.extracted_seller_name END,
      extracted_supplier_vat  = CASE WHEN NOT issued AND e ? 'supplier_vat' THEN nullif(e->>'supplier_vat','') ELSE q.extracted_supplier_vat END,
      extracted_seller_vat    = CASE WHEN NOT issued AND e ? 'supplier_vat' THEN nullif(e->>'supplier_vat','') ELSE q.extracted_seller_vat END,
      extracted_buyer_name    = CASE WHEN issued AND e ? 'supplier_name' THEN nullif(e->>'supplier_name','') ELSE q.extracted_buyer_name END,
      extracted_buyer_vat     = CASE WHEN issued AND e ? 'supplier_vat' THEN nullif(e->>'supplier_vat','') ELSE q.extracted_buyer_vat END,
      extracted_document_number = CASE WHEN e ? 'document_number' THEN nullif(e->>'document_number','') ELSE q.extracted_document_number END,
      extracted_date   = CASE WHEN e ? 'date' THEN nullif(e->>'date','')::date ELSE q.extracted_date END,
      extracted_amount = CASE WHEN e ? 'amount' THEN nullif(e->>'amount','')::numeric ELSE q.extracted_amount END,
      extracted_vat_amount = CASE WHEN e ? 'vat' THEN nullif(e->>'vat','')::numeric ELSE q.extracted_vat_amount END,
      extracted_withholding_amount = CASE WHEN e ? 'withholding' THEN nullif(e->>'withholding','')::numeric ELSE q.extracted_withholding_amount END,
      extracted_currency = CASE WHEN e ? 'currency' THEN coalesce(nullif(e->>'currency',''), 'EUR') ELSE q.extracted_currency END,
      extracted_payment_method = CASE WHEN e ? 'payment_method' THEN nullif(e->>'payment_method','') ELSE q.extracted_payment_method END,
      extracted_card_last4 = CASE WHEN e ? 'card_last4' THEN nullif(right(regexp_replace(coalesce(e->>'card_last4',''), '\D', '', 'g'), 4), '') ELSE q.extracted_card_last4 END,
      paid_from_card_id = CASE WHEN e ? 'paid_from_card_id' OR e ? 'paid_from_account_id' THEN nullif(e->>'paid_from_card_id','')::uuid ELSE q.paid_from_card_id END,
      paid_from_account_id = CASE WHEN e ? 'paid_from_card_id' OR e ? 'paid_from_account_id'
        THEN CASE WHEN nullif(e->>'paid_from_card_id','') IS NULL THEN nullif(e->>'paid_from_account_id','')::uuid END
        ELSE q.paid_from_account_id END,
      marked_unpaid = CASE WHEN e ? 'marked_unpaid' THEN coalesce((e->>'marked_unpaid')::boolean, false) ELSE q.marked_unpaid END,
      suggested_classification_id = CASE WHEN e ? 'classification_id' THEN nullif(e->>'classification_id','')::uuid ELSE q.suggested_classification_id END,
      created_project_id = CASE WHEN e ? 'project_id' THEN nullif(e->>'project_id','')::uuid ELSE q.created_project_id END,
      assigned_collaborator_id = CASE WHEN e ? 'assigned_collaborator_id' THEN nullif(e->>'assigned_collaborator_id','')::uuid ELSE q.assigned_collaborator_id END
    WHERE q.id = _id;
    INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
      VALUES (r.entity_id, _id, 'edits', e - 'counterparty_id' - 'link_counterparty_id', uid);
    SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id;
  END IF;

  -- 2) counterparty (find by NIF, platform rules, create if new)
  cid := nullif(e->>'counterparty_id','')::uuid;
  IF cid IS NULL AND nullif(e->>'link_counterparty_id','') IS NOT NULL THEN
    cid := (e->>'link_counterparty_id')::uuid; linked := true;
  END IF;
  IF cid IS NULL THEN cid := CASE WHEN issued THEN r.matched_client_id ELSE r.matched_supplier_id END; END IF;
  IF cid IS NOT NULL AND NOT public.fin_company_visible(cid) AND NOT linked THEN
    RAISE EXCEPTION 'Counterparty not visible in this entity';
  END IF;
  IF cid IS NULL THEN
    vat := CASE WHEN issued THEN r.extracted_buyer_vat ELSE coalesce(r.extracted_supplier_vat, r.extracted_seller_vat) END;
    cname := CASE WHEN issued THEN r.extracted_buyer_name ELSE coalesce(r.extracted_supplier_name, r.extracted_seller_name) END;
    IF NOT public.fin_tax_number_ok(vat) THEN RAISE EXCEPTION 'BLOCKED:counterparty'; END IF;
    vat_clean := upper(regexp_replace(vat, '[^A-Za-z0-9]', '', 'g'));
    IF vat_clean ~ '^(PT)?\d{9}$' THEN
      vat_clean := regexp_replace(vat_clean, '^PT', '');
      SELECT id INTO ex FROM public.companies WHERE nif = vat_clean LIMIT 1;
    ELSE
      SELECT id INTO ex FROM public.companies
       WHERE upper(regexp_replace(coalesce(foreign_tax_id,''), '[^A-Za-z0-9]', '', 'g')) = vat_clean LIMIT 1;
    END IF;
    IF ex.id IS NOT NULL THEN
      cid := ex.id;
      linked := NOT public.fin_company_visible(cid);
    ELSE
      INSERT INTO public.companies(nome, nif, tax_country, is_supplier, is_client, created_by)
      VALUES (coalesce(nullif(cname,''), CASE WHEN issued THEN 'Cliente' ELSE 'Fornecedor' END),
              vat_clean,
              CASE WHEN vat_clean ~ '^\d{9}$' THEN 'PT' ELSE left(vat_clean, 2) END,
              NOT issued, issued, uid)
      RETURNING id INTO cid;
      created := true;
    END IF;
  END IF;
  IF linked THEN
    INSERT INTO public.finance_entity_companies(entity_id, company_id, linked_by)
    VALUES (r.entity_id, cid, uid) ON CONFLICT DO NOTHING;
  END IF;
  -- flag the role only where the caller may edit the company (PSA staff, or not used by PSA)
  IF NOT created AND (public.is_psa_staff() OR NOT public.company_psa_referenced(cid)) THEN
    UPDATE public.companies SET is_supplier = true WHERE id = cid AND NOT issued AND NOT coalesce(is_supplier, false);
    UPDATE public.companies SET is_client = true WHERE id = cid AND issued AND NOT coalesce(is_client, false);
  END IF;
  IF issued THEN
    UPDATE public.financial_document_review_queue SET matched_client_id = cid, client_match_status = 'matched',
      supplier_approved_at = now(), supplier_approved_by = uid WHERE id = _id;
  ELSE
    UPDATE public.financial_document_review_queue SET matched_supplier_id = cid, supplier_match_status = 'matched',
      supplier_approved_at = now(), supplier_approved_by = uid WHERE id = _id;
  END IF;
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, CASE WHEN issued THEN 'client_approved' ELSE 'supplier_approved' END,
            jsonb_build_object('company_id', cid, 'created', created, 'linked', linked), uid);
  SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id;

  -- Resolve the exact bank match under the same lock before readiness/finalisation.
  IF r.paid_from_card_id IS NULL AND r.paid_from_account_id IS NULL AND NOT r.marked_unpaid THEN
    SELECT * INTO ex FROM public.fin_queue_bank_paid_with(r);
    IF ex.card_id IS NOT NULL OR ex.account_id IS NOT NULL THEN
      UPDATE public.financial_document_review_queue SET paid_from_card_id=ex.card_id,
        paid_from_account_id=ex.account_id, paid_with_source='bank', paid_method_unknown=false WHERE id=_id;
      SELECT * INTO r FROM public.financial_document_review_queue WHERE id=_id;
    END IF;
  END IF;
  -- 3) every rule must hold before anything is approved/finalised
  blk := public.fin_queue_blockers(r);
  IF cardinality(blk) > 0 THEN RAISE EXCEPTION 'BLOCKED:%', array_to_string(blk, ','); END IF;

  -- 4) classification (+ learning correction as today)
  SELECT code INTO cls FROM public.financial_classifications WHERE id = r.suggested_classification_id;
  ai_code := coalesce(r.applied_learning->>'ai_code', r.model_runs->'claude'->>'classification_code', r.suggested_classification_code);
  IF cls.code IS NOT NULL AND ai_code IS DISTINCT FROM cls.code THEN
    INSERT INTO public.finance_intake_corrections(entity_id, queue_item_id, supplier_nif, field, ai_value, corrected_value, corrected_by)
    VALUES (r.entity_id, _id,
            nullif(lower(regexp_replace(regexp_replace(upper(coalesce(r.extracted_supplier_vat,'')), '[^A-Z0-9]', '', 'g'), '^PT', '')), ''),
            'classification_code', ai_code, cls.code, uid);
  END IF;
  UPDATE public.financial_document_review_queue SET
    suggested_classification_code = cls.code,
    assigned_collaborator_id = CASE WHEN cls.code = 'BEN' OR cls.code LIKE 'BEN.%' OR cls.code IN ('PES.FOOD','PES.HEALTH','PES.PERS','PES.OTHER') THEN assigned_collaborator_id END,
    classification_approved_at = now(), classification_approved_by = uid
  WHERE id = _id;
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'classification_approved', jsonb_build_object('classification_id', r.suggested_classification_id, 'code', cls.code), uid);
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'paid_with', jsonb_build_object('card_id', r.paid_from_card_id, 'account_id', r.paid_from_account_id, 'unpaid', r.marked_unpaid), uid);
  SELECT * INTO r FROM public.financial_document_review_queue WHERE id = _id;

  -- 5) finalise: one document per linked group
  SELECT created_expense_id INTO doc_id FROM public.financial_document_review_queue
   WHERE linked_document_group_id = r.linked_document_group_id AND created_expense_id IS NOT NULL LIMIT 1;
  IF doc_id IS NULL THEN
    total := coalesce(r.extracted_amount, 0);
    vatamt := coalesce(r.extracted_vat_amount, 0);
    wh := CASE WHEN coalesce(r.extracted_withholding_amount, 0) > 0 THEN least(abs(r.extracted_withholding_amount), total) ELSE 0 END;
    SELECT nome INTO cp_name FROM public.companies WHERE id = cid;
    INSERT INTO public.financial_documents(
      entity_id, doc_type, direction, source, status, document_number, issue_date, due_date,
      counterparty_supplier_id, counterparty_client_id, issuer_name, issuer_nif, issuer_tax_country, issuer_foreign_tax_id,
      counterparty_name_snapshot, classification_id, project_id, not_project_related, currency,
      subtotal_ex_vat, vat_amount, total_inc_vat, withholding_tax_amount, file_path, ocr_metadata,
      billed_to_own_vat, payment_method_extracted, card_last4, paid_from_account_id, paid_from_card_id,
      payment_status, created_by, project_expense_id)
    VALUES (
      r.entity_id,
      (CASE WHEN r.intake_type = 'nota_credito' THEN CASE WHEN issued THEN 'client_credit_note' ELSE 'supplier_credit_note' END
            ELSE CASE WHEN issued THEN 'client_invoice' ELSE 'supplier_invoice' END END)::financial_doc_type,
      (CASE WHEN issued THEN 'issued' ELSE 'received' END)::financial_doc_direction,
      'ocr'::financial_doc_source, 'issued'::financial_doc_status,
      r.extracted_document_number, coalesce(r.extracted_date, current_date), r.extracted_due_date,
      CASE WHEN issued THEN NULL ELSE cid END, CASE WHEN issued THEN cid END,
      r.issuer_name, r.issuer_nif, r.issuer_tax_country, r.issuer_foreign_tax_id,
      coalesce(cp_name, CASE WHEN issued THEN r.extracted_buyer_name ELSE r.extracted_supplier_name END),
      r.suggested_classification_id, r.created_project_id, r.created_project_id IS NULL,
      coalesce(r.extracted_currency, 'EUR'), greatest(total - vatamt, 0), vatamt, total, wh,
      r.source_file_url, r.raw_extraction, coalesce(r.buyer_vat_is_own, false), r.extracted_payment_method,
      r.extracted_card_last4, r.paid_from_account_id, r.paid_from_card_id,
      CASE WHEN r.payment_status = 'paid_at_source' THEN 'paid_at_source' ELSE 'awaiting_payment' END, uid, CASE WHEN EXISTS(SELECT 1 FROM pm_expenses WHERE id=r.source_project_expense_id AND workflow_version=2) THEN r.source_project_expense_id END)
    RETURNING id INTO doc_id;
  END IF;

  -- inventory marker (same as finalizeQueueItem)
  IF coalesce(r.mark_for_inventory, false) THEN
    IF NOT EXISTS (SELECT 1 FROM public.financial_document_lines WHERE document_id = doc_id)
       AND jsonb_typeof(r.raw_extraction->'line_items') = 'array' THEN
      i := 0;
      FOR it IN SELECT * FROM jsonb_array_elements(r.raw_extraction->'line_items') LOOP
        qty := coalesce(nullif(it->>'quantity','')::numeric, 1); IF qty = 0 THEN qty := 1; END IF;
        amt := coalesce(nullif(it->>'amount_ex_vat','')::numeric, nullif(it->>'unit_price_ex_vat','')::numeric * qty);
        INSERT INTO public.financial_document_lines(document_id, description, quantity, unit_price_ex_vat, amount_ex_vat, vat_rate, sort_order, project_id, classification_id)
        VALUES (doc_id, coalesce(nullif(btrim(it->>'description'),''), 'Item ' || (i + 1)), qty,
                coalesce(nullif(it->>'unit_price_ex_vat','')::numeric, amt / qty), amt, nullif(it->>'vat_rate','')::numeric,
                i, r.created_project_id, r.suggested_classification_id);
        i := i + 1;
      END LOOP;
    END IF;
    UPDATE public.financial_documents SET inventory_status = 'pending' WHERE id = doc_id AND inventory_status IS NULL;
  END IF;

  -- staff benefit → HR dashboard (same as finalizeQueueItem)
  IF r.assigned_collaborator_id IS NOT NULL AND coalesce(r.extracted_amount, 0) > 0
     AND NOT EXISTS (SELECT 1 FROM public.benefit_expenses WHERE financial_document_id = doc_id) THEN
    SELECT id, legacy_enum INTO cat FROM public.benefit_categories
     WHERE classification_id = r.suggested_classification_id AND active ORDER BY sort_order LIMIT 1;
    d := coalesce(r.extracted_date, current_date);
    INSERT INTO public.benefit_expenses(entity_id, collaborator_id, ano_fiscal, categoria, category_id, classification_id,
      descricao, valor, data_despesa, estado, origin, financial_document_id, supplier_company_id, supplier_name_snapshot,
      supplier_nif, document_number, vat_amount, foto_path)
    VALUES (r.entity_id, r.assigned_collaborator_id, extract(year FROM d)::int, coalesce(cat.legacy_enum::text, 'outros')::benefit_category,
      cat.id, r.suggested_classification_id,
      coalesce(r.extracted_supplier_name, r.original_filename, r.suggested_classification_code, 'Benefício'),
      r.extracted_amount, d, 'pendente', 'finance', doc_id, r.matched_supplier_id, r.extracted_supplier_name,
      r.extracted_supplier_vat, r.extracted_document_number, nullif(coalesce(r.extracted_vat_amount, 0), 0), r.source_file_url);
  END IF;

  UPDATE public.financial_document_review_queue SET status = 'approved', created_expense_id = doc_id,
    reviewed_by = uid, reviewed_at = now()
  WHERE linked_document_group_id = r.linked_document_group_id
    AND supplier_approved_at IS NOT NULL AND classification_approved_at IS NOT NULL;
  INSERT INTO public.finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'finalized', jsonb_build_object('document_id', doc_id, 'historical', r.historical), uid);

  RETURN jsonb_build_object('ok', true, 'document_id', doc_id, 'counterparty_id', cid, 'created_counterparty', created, 'linked_counterparty', linked);
END $function$

;
CREATE POLICY pe_flow_read_boundary ON public.pm_expenses AS RESTRICTIVE FOR SELECT TO authenticated USING (workflow_version<>2 OR (is_psa_staff() AND (submitted_by=auth.uid() OR pe_project_lead(project_id) OR pe_finance_access(entity_id))));
CREATE OR REPLACE FUNCTION public.pe_directory(_project uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE ent uuid:='00000000-0000-4000-a000-000000000001'; BEGIN
 IF auth.uid() IS NULL OR NOT is_psa_staff() OR NOT (pe_finance_access(ent) OR (_project IS NOT NULL AND pm_has_assigned_access(auth.uid(),_project))) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object('collaborators',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nome)),'[]') FROM collaborators WHERE archived_at IS NULL),'accounts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',account_name)),'[]') FROM bank_accounts WHERE entity_id=ent AND is_active AND archived_at IS NULL),'cards',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(holder_name,'')||' · '||last4)),'[]') FROM payment_cards WHERE entity_id=ent AND active AND NOT is_personal),'projects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM pm_projects WHERE NOT finance_only AND (pe_finance_access(ent) OR pm_has_assigned_access(auth.uid(),id))),'myCollaborator',get_my_collaborator_id()); END $$;
CREATE FUNCTION public.pe_personal_purchase_payment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM financial_documents d JOIN pm_expenses e ON e.id=d.project_expense_id WHERE d.id=NEW.document_id AND e.workflow_version=2 AND e.payment_source_type='personal') THEN RAISE EXCEPTION 'Personal expenses are settled only through reimbursement batches'; END IF; RETURN NEW; END $$;
CREATE TRIGGER aaa_pe_personal_purchase_payment_guard BEFORE INSERT OR UPDATE ON public.financial_document_payments FOR EACH ROW EXECUTE FUNCTION public.pe_personal_purchase_payment_guard();
CREATE FUNCTION public.pe_invoice_document_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF (NEW.status='cancelled' OR (NEW.counterparty_client_id,NEW.entity_id,NEW.direction,NEW.doc_type) IS DISTINCT FROM (OLD.counterparty_client_id,OLD.entity_id,OLD.direction,OLD.doc_type)) AND EXISTS(SELECT 1 FROM project_expense_invoice_allocations a JOIN financial_document_lines l ON l.id=a.line_id WHERE l.document_id=OLD.id AND a.reversed_at IS NULL) THEN RAISE EXCEPTION 'Reverse expense allocations before changing invoice'; END IF; RETURN NEW; END $$;
CREATE TRIGGER pe_invoice_document_guard BEFORE UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.pe_invoice_document_guard();
CREATE FUNCTION public.pe_invoice_tax_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF (NEW.vat_amount,NEW.amount_inc_vat) IS DISTINCT FROM (OLD.vat_amount,OLD.amount_inc_vat) AND EXISTS(SELECT 1 FROM project_expense_invoice_allocations WHERE line_id=OLD.id AND reversed_at IS NULL) THEN RAISE EXCEPTION 'Reverse expense allocations before editing invoice line'; END IF; RETURN NEW; END $$;
CREATE TRIGGER pe_invoice_tax_guard BEFORE UPDATE ON public.financial_document_lines FOR EACH ROW EXECUTE FUNCTION public.pe_invoice_tax_guard();
DO $$ DECLARE d text; pattern text:=' IF _amount<=0 OR _amount>fin_tx_open_balance(tx.id)'; BEGIN
 SELECT pg_get_functiondef('public.pe_match_purchase(uuid,uuid,numeric)'::regprocedure) INTO d;
 IF (length(d)-length(replace(d,pattern,'')))/length(pattern)<>1 THEN RAISE EXCEPTION 'Purchase match guard changed'; END IF;
 EXECUTE replace(d,pattern,' IF EXISTS(SELECT 1 FROM project_expense_invoice_allocations WHERE expense_id=e.id AND reversed_at IS NULL) THEN RAISE EXCEPTION ''Reverse allocations before changing expense''; END IF; IF _amount<=0 OR _amount>fin_tx_open_balance(tx.id)'); END $$;
DO $$ DECLARE d text; pattern text:=' doc:=(r->>''document_id'')::uuid;'; BEGIN
 SELECT pg_get_functiondef('public.pe_confirm_intake(uuid,uuid,jsonb)'::regprocedure) INTO d;
 IF (length(d)-length(replace(d,pattern,'')))/length(pattern)<>1 THEN RAISE EXCEPTION 'Intake confirm structure changed'; END IF;
 EXECUTE replace(d,pattern,pattern||' IF EXISTS(SELECT 1 FROM financial_document_payments WHERE document_id=doc) OR EXISTS(SELECT 1 FROM finance_holder_reimbursements WHERE document_id=doc AND project_expense_id IS DISTINCT FROM e.id) THEN RAISE EXCEPTION ''Existing payments require a separately approved adaptation''; END IF;'); END $$;
