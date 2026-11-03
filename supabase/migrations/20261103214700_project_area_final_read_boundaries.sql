CREATE FUNCTION public.pm_phase_a_baseline_gate(_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT NOT public.pm_project_access_cutover_active() OR (public.pm_project_area_proposed(_project,'financials',auth.uid()) AND public.pm_project_area_proposed(_project,'budget_cost',auth.uid()) AND public.pm_project_area_proposed(_project,'supplier_fees',auth.uid())) $$;
REVOKE ALL ON FUNCTION public.pm_phase_a_baseline_gate(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_phase_a_baseline_gate(uuid) TO authenticated,service_role;
ALTER POLICY phase_a_financial_gate ON public.pm_project_contract_baseline USING(public.pm_phase_a_baseline_gate(project_id));
ALTER POLICY phase_a_area_gate ON public.pm_project_commercial_baselines USING(public.pm_phase_a_baseline_gate(project_id));
ALTER POLICY phase_a_area_gate ON public.pm_stage_commercial_baselines USING(public.pm_phase_a_baseline_gate(project_id));
CREATE FUNCTION public.pm_phase_a_queue_gate(_project uuid,_expense uuid,_direction text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.pm_project_access_cutover_active() THEN RETURN true; END IF;
 IF _expense IS NOT NULL THEN RETURN EXISTS(SELECT 1 FROM public.pm_expenses WHERE id=_expense AND public.pm_project_area_proposed(project_id,'expenses',auth.uid())); END IF;
 IF _project IS NOT NULL THEN RETURN public.pm_project_area_proposed(_project,CASE WHEN _direction='issued' THEN 'financials' ELSE 'expenses' END,auth.uid()); END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.pm_phase_a_queue_gate(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_phase_a_queue_gate(uuid,uuid,text) TO authenticated,service_role;
CREATE POLICY phase_a_linked_project_gate ON public.financial_document_review_queue AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_queue_gate(created_project_id,source_project_expense_id,direction::text));
CREATE POLICY phase_a_linked_project_gate ON public.financial_documents AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_queue_gate(project_id,project_expense_id,direction::text));
CREATE POLICY phase_a_linked_project_gate ON public.financial_document_lines AS RESTRICTIVE FOR SELECT TO authenticated USING((project_id IS NULL OR public.pm_phase_a_area_gate(project_id,'financials')) AND EXISTS(SELECT 1 FROM public.financial_documents d WHERE d.id=document_id));
CREATE FUNCTION public.pm_phase_a_financial_file_gate(_bucket text,_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 IF NOT public.pm_project_access_cutover_active() THEN RETURN true; END IF;
 FOR r IN SELECT created_project_id AS project_id,source_project_expense_id AS expense_id,direction::text AS direction FROM public.financial_document_review_queue WHERE source_bucket=_bucket AND (source_file_url=_name OR split_of_file_url=_name)
 UNION SELECT project_id,project_expense_id,direction::text FROM public.financial_documents WHERE _bucket='financial-documents' AND (file_path=_name OR source_file_url=_name)
 LOOP IF NOT public.pm_phase_a_queue_gate(r.project_id,r.expense_id,r.direction) THEN RETURN false; END IF; END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.pm_phase_a_financial_file_gate(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_phase_a_financial_file_gate(text,text) TO authenticated,service_role;
CREATE POLICY phase_a_linked_financial_file_gate ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_financial_file_gate(bucket_id,name));
DO $patch$ DECLARE d text; f text; arg text; BEGIN
 FOR f,arg IN SELECT * FROM (VALUES('pe_match_purchase(uuid,uuid,numeric)','_expense'),('pm_expense_request_approval(uuid,uuid)','p_expense_id'),('pm_expense_decide_approval(uuid,boolean,text)','p_expense_id')) x(f,arg) LOOP
 SELECT pg_get_functiondef(('public.'||f)::regprocedure) INTO d;
 IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing RPC boundary %',f; END IF;
 d:=overlay(d placing 'BEGIN PERFORM public.pm_require_expense_area('||arg||');' from position('BEGIN' in d) for 5); EXECUTE d;
 END LOOP;
 SELECT pg_get_functiondef('public.pm_require_expense_action_area(text,jsonb)'::regprocedure) INTO d;
 IF position('_action=''settleBatch''' in d)=0 THEN RAISE EXCEPTION 'Missing reimbursement action guard'; END IF;
 d:=replace(d,'_action=''settleBatch''','_action IN (''settleBatch'',''settle'')'); EXECUTE d;
 SELECT pg_get_functiondef('public.pe_directory(uuid)'::regprocedure) INTO d;
 IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing directory guard'; END IF;
 d:=overlay(d placing 'BEGIN IF _project IS NOT NULL AND NOT public.pm_phase_a_area_gate(_project,''expenses'') THEN RAISE EXCEPTION ''Forbidden'' USING ERRCODE=''42501''; END IF;' from position('BEGIN' in d) for 5); EXECUTE d;
 SELECT pg_get_functiondef('public.fin_confirm_queue_item(uuid,jsonb)'::regprocedure) INTO d;
 IF position('BEGIN' in d)=0 THEN RAISE EXCEPTION 'Missing queue confirmation boundary'; END IF;
 d:=overlay(d placing 'BEGIN IF NOT EXISTS(SELECT 1 FROM public.financial_document_review_queue q WHERE q.id=_id AND public.pm_phase_a_queue_gate(q.created_project_id,q.source_project_expense_id,q.direction::text)) THEN RAISE EXCEPTION ''Forbidden'' USING ERRCODE=''42501''; END IF;' from position('BEGIN' in d) for 5); EXECUTE d;
END $patch$;
COMMENT ON FUNCTION public.pm_phase_a_baseline_gate(uuid) IS 'Raw baseline rows include financial, budget and supplier values; require all represented areas when cutover ON. Date resolver remains separately Financials-scoped.';