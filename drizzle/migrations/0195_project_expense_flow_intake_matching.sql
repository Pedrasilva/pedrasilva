CREATE FUNCTION public.pe_confirm_intake(_id uuid,_expense uuid,_edits jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e pm_expenses; q financial_document_review_queue; r jsonb; doc uuid; BEGIN
 SELECT * INTO e FROM pm_expenses WHERE id=_expense FOR UPDATE; SELECT * INTO q FROM financial_document_review_queue WHERE id=_id FOR UPDATE;
 IF e.id IS NULL OR e.workflow_version<>2 OR q.id IS NULL OR q.entity_id IS DISTINCT FROM e.entity_id OR NOT pe_finance_access(e.entity_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF q.source_project_expense_id IS NOT NULL AND q.source_project_expense_id<>e.id THEN RAISE EXCEPTION 'Receipt already linked'; END IF;
 IF e.purchase_document_id IS NOT NULL AND e.purchase_document_id IS DISTINCT FROM q.created_expense_id THEN RAISE EXCEPTION 'Expense already has a confirmed receipt'; END IF;
 PERFORM set_config('app.pe_action','1',true); PERFORM set_config('app.pm_expense_rpc','1',true);
 UPDATE financial_document_review_queue SET source_project_expense_id=e.id,created_project_id=e.project_id,project_expense_context=jsonb_build_object('workflowVersion',2,'paidBy',e.payment_source_type,'collaboratorId',e.reimburse_collaborator_id,'rebillMode',e.rebill_mode),payment_status=CASE WHEN e.payment_source_type='personal' THEN 'paid_at_source' ELSE payment_status END,paid_method_unknown=CASE WHEN e.payment_source_type='personal' THEN true ELSE paid_method_unknown END WHERE id=q.id;
 IF q.created_expense_id IS NOT NULL AND q.status::text IN ('approved','paid') THEN r:=jsonb_build_object('document_id',q.created_expense_id); ELSE r:=fin_confirm_queue_item(q.id,_edits||jsonb_build_object('project_id',e.project_id)); END IF;
 doc:=(r->>'document_id')::uuid;
 IF EXISTS(SELECT 1 FROM pm_expenses WHERE purchase_document_id=doc AND id<>e.id) THEN RAISE EXCEPTION 'Receipt already linked'; END IF;
 UPDATE financial_documents SET project_expense_id=e.id,payment_status=CASE WHEN e.payment_source_type='personal' THEN 'paid_at_source' ELSE payment_status END WHERE id=doc;
 UPDATE pm_expenses SET purchase_document_id=doc,supplier_company_id=(SELECT counterparty_supplier_id FROM financial_documents WHERE id=doc) WHERE id=e.id;
 PERFORM pe_obligation_sync(e.id); PERFORM pe_event(e.id,'receiptConfirmed',to_jsonb(e),jsonb_build_object('documentId',doc,'queueId',q.id)); RETURN r;
 END $$;
REVOKE ALL ON FUNCTION public.pe_confirm_intake(uuid,uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pe_confirm_intake(uuid,uuid,jsonb) TO authenticated;
CREATE FUNCTION public.pe_match_purchase(_expense uuid,_tx uuid,_amount numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE e pm_expenses; tx bank_transactions; c payment_cards; prior jsonb; BEGIN
 SELECT * INTO e FROM pm_expenses WHERE id=_expense FOR UPDATE; SELECT * INTO tx FROM bank_transactions WHERE id=_tx FOR UPDATE;
 IF e.id IS NULL OR e.workflow_version<>2 OR NOT pe_finance_access(e.entity_id) OR e.payment_source_type='personal' OR tx.id IS NULL OR tx.entity_id<>e.entity_id OR tx.amount>=0 OR fin_bank_tx_in_locked_period(tx.id) OR e.purchase_document_id IS NULL THEN RAISE EXCEPTION 'Invalid purchase match'; END IF;
 IF e.payment_source_type='company_account' AND tx.bank_account_id IS DISTINCT FROM e.paid_from_account_id THEN RAISE EXCEPTION 'Payment account does not match'; END IF;
 IF e.payment_source_type='company_card' THEN SELECT * INTO c FROM payment_cards WHERE id=e.payment_card_id; IF c.bank_account_id IS DISTINCT FROM tx.bank_account_id THEN RAISE EXCEPTION 'Payment card account does not match'; END IF; END IF;
 IF _amount<=0 OR _amount>fin_tx_open_balance(tx.id) THEN RAISE EXCEPTION 'Amount exceeds movement balance'; END IF;
 IF EXISTS(SELECT 1 FROM financial_document_payments WHERE document_id=e.purchase_document_id) THEN RAISE EXCEPTION 'Purchase already has payments; review existing links'; END IF;
 prior:=to_jsonb(e); PERFORM set_config('app.pe_action','1',true); PERFORM set_config('app.pm_expense_rpc','1',true);
 UPDATE pm_expenses SET eur_amount=_amount,purchase_price=_amount,exchange_rate=_amount/original_amount,exchange_rate_date=tx.transaction_date,exchange_rate_source='bank_actual',exchange_evidence=jsonb_build_object('bankTransactionId',tx.id,'previous',jsonb_build_object('eur',e.eur_amount,'rate',e.exchange_rate,'source',e.exchange_rate_source)) WHERE id=e.id;
 INSERT INTO financial_document_payments(document_id,bank_transaction_id,amount,payment_date,method,created_by) VALUES(e.purchase_document_id,tx.id,_amount,tx.transaction_date,'bank_transfer',auth.uid());
 PERFORM pe_event(e.id,'purchaseMatch',prior,(SELECT to_jsonb(z) FROM pm_expenses z WHERE id=e.id),NULL,jsonb_build_object('transactionId',tx.id)); RETURN jsonb_build_object('id',e.id);
 END $$;
REVOKE ALL ON FUNCTION public.pe_match_purchase(uuid,uuid,numeric) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pe_match_purchase(uuid,uuid,numeric) TO authenticated;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.fin_reconcile_candidates(uuid,text)'::regprocedure) INTO d;
 IF position('UNION ALL' in d)=0 OR position('r.status NOT IN' in d)=0 THEN RAISE EXCEPTION 'Candidate structure changed'; END IF;
 d:=replace(d,'r.status NOT IN (''repaid'',''cancelled'')','r.status NOT IN (''repaid'',''cancelled'') AND r.project_expense_id IS NULL');
 d:=replace(d,'AND d.direction::text = CASE WHEN t.amount > 0 THEN ''issued'' ELSE ''received'' END','AND d.direction::text = CASE WHEN t.amount > 0 THEN ''issued'' ELSE ''received'' END AND NOT EXISTS(SELECT 1 FROM pm_expenses e WHERE e.id=d.project_expense_id AND e.payment_source_type=''personal'')');
 d:=replace(d,'UNION ALL','UNION ALL SELECT ''reimbursement_batch''::text,b.id,b.reference::text,c.nome::text,b.created_at::date,sum(a.reserved_amount)::numeric,sum(a.reserved_amount-a.settled_amount)::numeric,NULL::text,''reimbursement''::text FROM project_reimbursement_batches b JOIN project_reimbursement_allocations a ON a.batch_id=b.id AND a.reversed_at IS NULL JOIN collaborators c ON c.id=b.collaborator_id WHERE t.amount<0 AND b.entity_id=t.entity_id AND (s IS NULL OR c.nome ILIKE ''%''||s||''%'' OR b.reference ILIKE ''%''||s||''%'') GROUP BY b.id,c.nome HAVING sum(a.reserved_amount-a.settled_amount)>0 UNION ALL');
 EXECUTE d;
END $$;
CREATE FUNCTION public.pe_invoice_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE lid uuid; BEGIN
 lid:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF EXISTS(SELECT 1 FROM project_expense_invoice_allocations WHERE line_id=lid AND reversed_at IS NULL) THEN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW.document_id,NEW.project_id,NEW.amount_ex_vat,NEW.quantity,NEW.unit_price_ex_vat,NEW.vat_rate) IS DISTINCT FROM (OLD.document_id,OLD.project_id,OLD.amount_ex_vat,OLD.quantity,OLD.unit_price_ex_vat,OLD.vat_rate)) THEN RAISE EXCEPTION 'Reverse expense allocations before editing invoice line'; END IF; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER pe_invoice_guard BEFORE UPDATE OR DELETE ON public.financial_document_lines FOR EACH ROW EXECUTE FUNCTION public.pe_invoice_guard();
CREATE FUNCTION public.pe_payment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM project_expense_receipt_allocations WHERE payment_id=OLD.id AND reversed_at IS NULL) THEN RAISE EXCEPTION 'Reverse expense receipts before changing payment'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER pe_payment_guard BEFORE UPDATE OR DELETE ON public.financial_document_payments FOR EACH ROW EXECUTE FUNCTION public.pe_payment_guard();
CREATE FUNCTION public.pe_directory(_project uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE ent uuid:='00000000-0000-4000-a000-000000000001'; BEGIN
 IF auth.uid() IS NULL OR NOT is_psa_staff() OR NOT (pe_finance_access(ent) OR (_project IS NOT NULL AND pm_has_assigned_access(auth.uid(),_project))) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN jsonb_build_object('collaborators',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nome)),'[]') FROM collaborators WHERE archived_at IS NULL),'accounts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',account_name)),'[]') FROM bank_accounts WHERE entity_id=ent AND active),'cards',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(holder_name,'')||' · '||last4)),'[]') FROM payment_cards WHERE entity_id=ent AND active AND NOT is_personal),'projects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM pm_projects WHERE NOT finance_only AND (pe_finance_access(ent) OR pm_has_assigned_access(auth.uid(),id))),'myCollaborator',get_my_collaborator_id()); END $$;
REVOKE ALL ON FUNCTION public.pe_directory(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pe_directory(uuid) TO authenticated;
CREATE FUNCTION public.pe_expense_figures(_project uuid DEFAULT NULL) RETURNS TABLE(expense_id uuid,cost_amount numeric,billed_amount numeric,received_amount numeric,reserved_amount numeric,reimbursed_amount numeric) LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT e.id,e.eur_amount,
 coalesce((SELECT sum(a.billed_amount) FROM project_expense_invoice_allocations a JOIN financial_document_lines l ON l.id=a.line_id JOIN financial_documents d ON d.id=l.document_id WHERE a.expense_id=e.id AND a.reversed_at IS NULL AND d.status NOT IN ('draft','cancelled')),0),
 coalesce((SELECT sum(r.amount) FROM project_expense_receipt_allocations r JOIN project_expense_invoice_allocations a ON a.id=r.invoice_allocation_id WHERE a.expense_id=e.id AND a.reversed_at IS NULL AND r.reversed_at IS NULL),0),
 coalesce((SELECT sum(a.reserved_amount) FROM project_reimbursement_allocations a JOIN finance_holder_reimbursements o ON o.id=a.obligation_id WHERE o.project_expense_id=e.id AND a.reversed_at IS NULL),0),
 coalesce((SELECT sum(a.settled_amount) FROM project_reimbursement_allocations a JOIN finance_holder_reimbursements o ON o.id=a.obligation_id WHERE o.project_expense_id=e.id AND a.reversed_at IS NULL),0)
 FROM pm_expenses e WHERE workflow_version=2 AND (_project IS NULL OR e.project_id=_project) $$;
REVOKE ALL ON FUNCTION public.pe_expense_figures(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pe_expense_figures(uuid) TO authenticated;
DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.pe_action(text,jsonb)'::regprocedure) INTO d;
 IF position('INSERT INTO notifications' in d)=0 THEN RAISE EXCEPTION 'Missing notification block'; END IF;
 d:=replace(d,'INSERT INTO notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) SELECT u.user_id', 'INSERT INTO notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) SELECT p.user_id,''expense_approval_requested'',''Despesa para aprovar · Expense to approve'',e.description,''/projects/''||e.project_id||''?tab=expenses'',''projects'',''pm_expense'',eid,''pe-lead-submit:''||eid||'':''||e.expense_revision FROM profiles p WHERE p.collaborator_id=lead AND p.user_id<>auth.uid() ON CONFLICT(user_id,dedupe_key) DO NOTHING; INSERT INTO notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) SELECT u.user_id');
 EXECUTE d; END $$;