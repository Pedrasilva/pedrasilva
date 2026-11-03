-- Run only in a privileged, single transaction. The nested exception block
-- restores the gate definition and deletes the sole fixture before returning.
CREATE OR REPLACE FUNCTION public.pm_validate_cutover_fixture() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $validation$
DECLARE admin_id uuid; member_id uuid; member_resource uuid; global_id uuid; outsider_id uuid;
 p uuid:=gen_random_uuid(); st uuid:=gen_random_uuid(); inv uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); outitem uuid:=gen_random_uuid();
 baseline uuid:=gen_random_uuid(); expense uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); queue uuid:=gen_random_uuid();
 obligation uuid:=gen_random_uuid(); batch uuid:=gen_random_uuid(); collaborator uuid; stage_supplier uuid:=gen_random_uuid();
 n integer; got integer; mode integer; allowed boolean; uid uuid; viewstate jsonb; saved jsonb; tests integer:=0; result jsonb;
 path text:='intake/[QA DISPOSABLE] cutover-fixture.pdf'; original_gate text;
BEGIN
 SELECT pg_get_functiondef('public.pm_project_access_cutover_active()'::regprocedure) INTO original_gate;
 IF public.pm_project_access_cutover_active() THEN RAISE EXCEPTION 'Real cutover must remain OFF'; END IF;
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT u.id,r.id,c.id INTO member_id,member_resource,collaborator FROM auth.users u
 JOIN public.collaborators c ON lower(c.email)=lower(u.email) AND c.archived_at IS NULL
 JOIN public.pm_resources r ON r.collaborator_id=c.id
 WHERE NOT public.has_role(u.id,'admin') AND NOT EXISTS(SELECT 1 FROM public.pm_global_financial_capabilities g WHERE g.user_id=u.id AND g.enabled)
 AND NOT public.has_permission(u.id,'finance.dashboard') ORDER BY u.id LIMIT 1;
 SELECT user_id INTO global_id FROM public.pm_global_financial_capabilities WHERE enabled AND user_id<>admin_id ORDER BY user_id LIMIT 1;
 SELECT u.id INTO outsider_id FROM auth.users u WHERE NOT EXISTS(SELECT 1 FROM public.collaborators c WHERE lower(c.email)=lower(u.email) AND c.archived_at IS NULL)
 AND NOT public.has_role(u.id,'admin') ORDER BY u.id LIMIT 1;
 IF admin_id IS NULL OR member_id IS NULL OR global_id IS NULL OR outsider_id IS NULL THEN RAISE EXCEPTION 'Missing test identities'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  INSERT INTO public.pm_projects(id,name,start_date,status) VALUES(p,'[QA DISPOSABLE] Cutover ON single fixture','2026-06-01','active');
  INSERT INTO public.pm_stages(id,project_id,name,start_date,end_date,status) VALUES(st,p,'[QA DISPOSABLE] Stage','2026-06-01','2026-06-09','active');
  PERFORM public.pm_change_project_team(p,member_resource,'manager',false,'QA fixture manager');
  INSERT INTO public.pm_invoices(id,project_id,invoice_number,entity_id) VALUES(inv,p,'[QA DISPOSABLE] CUTOVER','00000000-0000-4000-a000-000000000001');
  INSERT INTO public.pm_invoice_items(invoice_id,stage_id,description,rate) VALUES(inv,st,'[QA DISPOSABLE] Invoice item',100);
  INSERT INTO public.pm_payment_schedule_items(id,project_id,stage_id,label,trigger_type,amount_type,amount_value,payment_terms,payment_offset_days,entity_id)
  VALUES(item,p,st,'[QA DISPOSABLE] Inflow','stage_end','fixed',100,'30 dias de calendario',30,'00000000-0000-4000-a000-000000000001');
  INSERT INTO public.pm_payment_schedule_items(id,project_id,stage_id,label,trigger_type,amount_type,amount_value,direction,entity_id)
  VALUES(outitem,p,st,'[QA DISPOSABLE] Outflow','stage_end','fixed',50,'outflow','00000000-0000-4000-a000-000000000001');
  INSERT INTO public.pm_project_contract_baseline(id,project_id,total_fee,total_internal_fee,total_external_fee) VALUES(baseline,p,100,60,40);
  INSERT INTO public.pm_project_contract_baseline_stages(baseline_id,live_stage_id,name,budget) VALUES(baseline,st,'[QA DISPOSABLE] Stage',60);
  INSERT INTO public.pm_project_contract_baseline_payments(baseline_id,label,amount) VALUES(baseline,'[QA DISPOSABLE] Baseline payment',100);
  INSERT INTO public.pm_stage_supplier_costs(id,project_id,stage_id,description,amount) VALUES(stage_supplier,p,st,'[QA DISPOSABLE] Supplier',50);
  INSERT INTO public.pm_materials(project_id,description,purchase_price) VALUES(p,'[QA DISPOSABLE] Material',50);
  INSERT INTO public.pm_expenses(id,project_id,description,purchase_price,receipt_path,entity_id) VALUES(expense,p,'[QA DISPOSABLE] Expense',100,path,'00000000-0000-4000-a000-000000000001');
  INSERT INTO public.project_expense_events(expense_id,action,actor) VALUES(expense,'QA fixture',admin_id);
  INSERT INTO public.financial_documents(id,doc_type,direction,issue_date,project_id,entity_id,file_path) VALUES(doc,'other','issued','2026-06-01',p,'00000000-0000-4000-a000-000000000001',path);
  INSERT INTO public.financial_document_lines(id,document_id,description,project_id) VALUES(line,doc,'[QA DISPOSABLE] Fiscal line',p);
  INSERT INTO public.financial_document_review_queue(id,source_file_url,created_project_id,direction,entity_id,created_by) VALUES(queue,path,p,'issued','00000000-0000-4000-a000-000000000001',admin_id);
  PERFORM set_config('app.pe_action','1',true);
  INSERT INTO public.finance_holder_reimbursements(id,entity_id,project_expense_id,collaborator_id,amount,status) VALUES(obligation,'00000000-0000-4000-a000-000000000001',expense,collaborator,100,'owed');
  INSERT INTO public.project_reimbursement_batches(id,entity_id,collaborator_id,reference,created_by) VALUES(batch,'00000000-0000-4000-a000-000000000001',collaborator,'[QA DISPOSABLE] Batch',admin_id);
  INSERT INTO public.project_reimbursement_allocations(batch_id,obligation_id,reserved_amount,actor) VALUES(batch,obligation,100,admin_id);
  PERFORM set_config('app.pe_action','',true);
  -- Not visible to concurrent sessions: DDL and all fixture writes roll back below.
  EXECUTE 'CREATE OR REPLACE FUNCTION public.pm_project_access_cutover_active() RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS ''SELECT true''';
  FOR mode IN 0..5 LOOP
   PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
   PERFORM public.pm_change_project_access(p,member_resource,jsonb_build_object('financials',mode IN(1,5),'budget_cost',mode IN(2,5),'expenses',mode IN(3,5),'supplier_fees',mode IN(4,5)),mode+1,'QA isolated ON mode');
   PERFORM set_config('request.jwt.claim.sub',member_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
   SET LOCAL ROLE authenticated;
   SELECT count(*) INTO got FROM public.pm_invoices WHERE id=inv;
   IF got<>CASE WHEN mode IN(1,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Invoice boundary mode % got %',mode,got; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.pm_invoice_items WHERE invoice_id=inv;
   IF got<>CASE WHEN mode IN(1,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Invoice child boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.pm_payment_schedule_items WHERE id=item;
   IF got<>CASE WHEN mode IN(1,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Inflow boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.pm_payment_schedule_items WHERE id=outitem;
   IF got<>CASE WHEN mode IN(4,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Outflow boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.pm_stage_supplier_costs WHERE id=stage_supplier;
   IF got<>CASE WHEN mode IN(4,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Supplier boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.pm_project_contract_baseline WHERE id=baseline;
   IF got<>CASE WHEN mode=5 THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Raw baseline multi-area mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.pm_project_contract_baseline_stages WHERE baseline_id=baseline;
   IF got<>CASE WHEN mode=5 THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Baseline child mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.pm_expenses WHERE id=expense;
   IF got<>CASE WHEN mode IN(3,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Expense boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.project_expense_events WHERE expense_id=expense;
   IF got<>CASE WHEN mode IN(3,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Expense child mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.project_reimbursement_batches WHERE id=batch;
   IF got<>CASE WHEN mode IN(3,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Batch boundary mode % got %',mode,got; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.finance_holder_reimbursements WHERE id=obligation;
   IF got<>CASE WHEN mode IN(3,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Obligation boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.project_reimbursement_allocations WHERE batch_id=batch;
   IF got<>CASE WHEN mode IN(3,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Batch child boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.financial_documents WHERE id=doc;
   IF got<>CASE WHEN mode IN(1,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Fiscal document boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.financial_document_lines WHERE id=line;
   IF got<>CASE WHEN mode IN(1,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Fiscal line boundary mode %',mode; END IF; tests:=tests+1;
   SELECT count(*) INTO got FROM public.financial_document_review_queue WHERE id=queue;
   IF got<>CASE WHEN mode IN(1,5) THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Queue boundary mode %',mode; END IF; tests:=tests+1;
   IF public.pm_phase_a_file_gate('financial-documents',path) IS DISTINCT FROM (mode IN(3,5)) THEN RAISE EXCEPTION 'Receipt file gate mode %',mode; END IF;
   IF public.pm_phase_a_financial_file_gate('financial-documents',path) IS DISTINCT FROM (mode IN(1,5)) THEN RAISE EXCEPTION 'Fiscal file gate mode %',mode; END IF; tests:=tests+2;
   allowed:=false;
   BEGIN viewstate:=public.pm_project_incoming_timing(p); allowed:=true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   IF allowed IS DISTINCT FROM (mode IN(1,5)) THEN RAISE EXCEPTION 'Timing projection boundary mode %',mode; END IF; tests:=tests+1;
   IF mode=1 THEN
    IF NOT public.can_edit_project_payment_dates(p) THEN RAISE EXCEPTION 'PM date helper denied'; END IF;
    PERFORM public.pm_change_payment_dates(item,'{"planned_invoice_date_override":"2026-06-15"}', 'QA own project date');
    allowed:=false; BEGIN PERFORM public.pm_change_payment_dates(item,'{"amount_value":999}','QA forbidden amount'); allowed:=true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF allowed THEN RAISE EXCEPTION 'PM amount patch allowed'; END IF; tests:=tests+2;
   END IF;
   IF mode=0 THEN
    allowed:=false; BEGIN PERFORM public.pe_match_purchase(expense,gen_random_uuid(),100); allowed:=true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF allowed THEN RAISE EXCEPTION 'Ungated purchase RPC'; END IF; tests:=tests+1;
    allowed:=false; BEGIN PERFORM public.pe_action('submit',jsonb_build_object('expenseId',expense)); allowed:=true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF allowed THEN RAISE EXCEPTION 'Ungated expense action'; END IF; tests:=tests+1;
   END IF;
   RESET ROLE;
  END LOOP;
  FOREACH uid IN ARRAY ARRAY[global_id,outsider_id] LOOP
   PERFORM set_config('request.jwt.claim.sub',uid::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
   SET LOCAL ROLE authenticated;
   SELECT count(*) INTO got FROM public.pm_invoices WHERE id=inv;
   IF got<>CASE WHEN uid=global_id THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Global/outsider invoice isolation'; END IF;
   SELECT count(*) INTO got FROM public.pm_expenses WHERE id=expense;
   IF got<>CASE WHEN uid=global_id THEN 1 ELSE 0 END THEN RAISE EXCEPTION 'Global/outsider expense isolation'; END IF; tests:=tests+2;
   RESET ROLE;
  END LOOP;
  IF public.pm_parse_payment_terms('30 (trinta) dias de calendário')<>30 OR public.pm_parse_payment_terms('30 dias de calendario')<>30 OR public.pm_parse_payment_terms('Pronto pagamento')<>0 OR public.pm_parse_payment_terms('30 dias úteis') IS NOT NULL OR public.pm_parse_payment_terms('a combinar') IS NOT NULL THEN RAISE EXCEPTION 'Strict terms parser failed'; END IF; tests:=tests+5;
  RAISE EXCEPTION 'QA_ROLLBACK_COMPLETE' USING ERRCODE='ZQ001';
 EXCEPTION WHEN SQLSTATE 'ZQ001' THEN RESET ROLE; result:=jsonb_build_object('checks',tests,'fixture',p,'rolledBack',true,'gateOff',NOT public.pm_project_access_cutover_active());
 END;
 IF public.pm_project_access_cutover_active() OR pg_get_functiondef('public.pm_project_access_cutover_active()'::regprocedure) IS DISTINCT FROM original_gate OR EXISTS(SELECT 1 FROM public.pm_projects WHERE id=p) THEN RAISE EXCEPTION 'Fixture/gate rollback failed'; END IF;
 RETURN result;
END $validation$;
REVOKE ALL ON FUNCTION public.pm_validate_cutover_fixture() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_validate_cutover_fixture() TO service_role;