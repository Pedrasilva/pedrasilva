-- Function-only repair; preserve global company RLS and deliberate explicit-link behavior.
DO $migration$
DECLARE v_definition text; v_predicate text;
BEGIN
 v_definition:=pg_get_functiondef('public.fin_confirm_queue_item(uuid,jsonb)'::regprocedure);
 IF (length(v_definition)-length(replace(v_definition,'public.fin_company_visible(cid)','')))/length('public.fin_company_visible(cid)') <> 2 THEN RAISE EXCEPTION 'Unexpected intake visibility checks'; END IF;
 v_predicate:=$predicate$(public.has_entity_access(r.entity_id) AND (
 EXISTS (SELECT 1 FROM public.financial_document_review_queue visible_queue WHERE visible_queue.entity_id = r.entity_id AND (visible_queue.matched_supplier_id = cid OR visible_queue.matched_client_id = cid))
 OR EXISTS (SELECT 1 FROM public.financial_documents visible_document WHERE visible_document.entity_id = r.entity_id AND (visible_document.counterparty_supplier_id = cid OR visible_document.counterparty_client_id = cid))
 OR EXISTS (SELECT 1 FROM public.financial_expense_items visible_expense WHERE visible_expense.entity_id = r.entity_id AND visible_expense.supplier_id = cid)
 OR EXISTS (SELECT 1 FROM public.finance_entity_companies visible_link WHERE visible_link.entity_id = r.entity_id AND visible_link.company_id = cid)
 ))$predicate$;
 v_definition:=replace(v_definition,'public.fin_company_visible(cid)',v_predicate);
 EXECUTE v_definition;
 IF strpos(pg_get_functiondef('public.fin_confirm_queue_item(uuid,jsonb)'::regprocedure),'public.fin_company_visible(cid)')>0 THEN RAISE EXCEPTION 'Old intake visibility check remains'; END IF;
END $migration$;