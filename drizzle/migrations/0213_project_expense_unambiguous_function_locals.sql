-- Function-only repair: rename PL/pgSQL locals, preserving quoted messages, JSON keys and columns.
DO $migration$
DECLARE
 v_name text; v_oid regprocedure; v_definition text; v_declarations text; v_declaration text;
 v_local text; v_identifiers jsonb; v_token text[]; v_rewritten text; v_before_literals text[]; v_after_literals text[];
BEGIN
 FOREACH v_name IN ARRAY ARRAY['pe_action','pe_obligation_sync','pe_invoice_guard','pe_directory','pe_link_queue','pe_queue_project_guard','pe_bank_reimbursement_guard','pe_receipt_period_guard','pe_invoice_from_expenses','pe_credit_guard','pe_save_intake','pe_confirm_intake','pe_match_purchase'] LOOP
 SELECT p.oid::regprocedure INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname=v_name;
 v_definition:=pg_get_functiondef(v_oid);
 IF v_name='pe_action' THEN
 IF strpos(v_definition,'FROM project_reimbursement_allocations a JOIN finance_holder_reimbursements o ON o.id=a.obligation_id WHERE o.project_expense_id=eid AND a.reversed_at IS NULL')=0 THEN RAISE EXCEPTION 'Unexpected pe_action allocation guard'; END IF;
 v_definition:=replace(v_definition,'FROM project_reimbursement_allocations a JOIN finance_holder_reimbursements o ON o.id=a.obligation_id WHERE o.project_expense_id=eid AND a.reversed_at IS NULL','FROM project_reimbursement_allocations reimbursement_alloc JOIN finance_holder_reimbursements reimbursement_obligation ON reimbursement_obligation.id=reimbursement_alloc.obligation_id WHERE reimbursement_obligation.project_expense_id=eid AND reimbursement_alloc.reversed_at IS NULL');
 END IF;
 v_declarations:=split_part(split_part(v_definition,'DECLARE',2),'BEGIN',1);
 IF v_declarations='' THEN RAISE EXCEPTION 'Missing declarations: %',v_name; END IF;
 v_identifiers:='{}';
 FOREACH v_declaration IN ARRAY string_to_array(v_declarations,';') LOOP
 v_local:=(regexp_match(v_declaration,'^\s*([a-z_]+)\s+'))[1];
 IF v_local IS NOT NULL THEN
 v_identifiers:=v_identifiers||jsonb_build_object(v_local,'v_'||CASE v_local WHEN 'e' THEN 'expense' WHEN 'olde' THEN 'previous_expense' WHEN 'eid' THEN 'expense_id' WHEN 'pid' THEN 'project_or_payer_id' WHEN 'ent' THEN 'entity_id' WHEN 'bid' THEN 'batch_or_allocation_id' WHEN 'b' THEN 'batch' WHEN 'o' THEN 'obligation' WHEN 'a' THEN 'allocation' WHEN 'l' THEN 'line' WHEN 'd' THEN 'doc' WHEN 'ip' THEN 'payment' WHEN 'ia' THEN 'invoice_allocation' WHEN 'n' THEN 'amount' WHEN 'x' THEN 'item' WHEN 'q' THEN 'queue' WHEN 'r' THEN 'result' WHEN 'doc' THEN 'document_id' WHEN 'c' THEN 'cost_or_card' WHEN 'vr' THEN 'vat_rate' WHEN 'p' THEN 'payment_or_id' WHEN 't' THEN 'tx' WHEN 'k' THEN 'key' WHEN 'lid' THEN 'line_id' WHEN 'txid' THEN 'tx_id' ELSE v_local END);
 END IF;
 END LOOP;
 v_rewritten:='';
 FOR v_token IN SELECT regexp_matches(v_definition,$lex$--[^\n]*|/\*.*?\*/|'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_][A-Za-z_0-9]*|.$lex$,'gs') LOOP
 v_rewritten:=v_rewritten||coalesce(v_identifiers->>v_token[1],v_token[1]);
 END LOOP;
 SELECT array_agg(m[1]) INTO v_before_literals FROM regexp_matches(v_definition,$lit$'(?:''|[^'])*'$lit$,'g') m;
 SELECT array_agg(m[1]) INTO v_after_literals FROM regexp_matches(v_rewritten,$lit$'(?:''|[^'])*'$lit$,'g') m;
 IF v_before_literals IS DISTINCT FROM v_after_literals THEN RAISE EXCEPTION 'Literal changed: %',v_name; END IF;
 EXECUTE v_rewritten;
 IF pg_get_functiondef(v_oid) ~ 'DECLARE\s+e\s' THEN RAISE EXCEPTION 'Old locals remain: %',v_name; END IF;
 END LOOP;
END $migration$;