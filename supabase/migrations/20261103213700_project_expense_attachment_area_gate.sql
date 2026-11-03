CREATE FUNCTION public.pm_phase_a_file_gate(_bucket text,_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_project uuid; v_found boolean:=false; r record;
BEGIN
 IF NOT public.pm_project_access_cutover_active() THEN RETURN true; END IF;
 FOR r IN SELECT project_id FROM public.pm_expenses WHERE receipt_path=_name UNION SELECT e.project_id FROM public.financial_document_review_queue q JOIN public.pm_expenses e ON e.id=q.source_project_expense_id WHERE _bucket='financial-documents' AND (q.source_file_url=_name OR q.split_of_file_url=_name) UNION SELECT e.project_id FROM public.financial_documents d JOIN public.pm_expenses e ON e.id=d.project_expense_id WHERE _bucket='financial-documents' AND d.file_path=_name LOOP
 v_found:=true; IF NOT public.pm_project_area_proposed(r.project_id,'expenses',auth.uid()) THEN RETURN false; END IF;
 END LOOP;
 IF v_found THEN RETURN true; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.pm_phase_a_file_gate(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_phase_a_file_gate(text,text) TO authenticated,service_role;
CREATE POLICY phase_a_project_expense_file_gate ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(public.pm_phase_a_file_gate(bucket_id,name));
COMMENT ON FUNCTION public.pm_phase_a_file_gate(text,text) IS 'Known project expense receipts inherit Expenses on active cutover. Unlinked uploads and unrelated entity documents retain legacy authorization; shared files require every linked project area.';