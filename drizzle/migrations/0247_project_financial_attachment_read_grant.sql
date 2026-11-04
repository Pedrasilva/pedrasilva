CREATE OR REPLACE FUNCTION public.pm_phase_a_financial_file_grant(_bucket text,_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.pm_project_access_cutover_active() OR _bucket<>'financial-documents' OR NOT public.is_psa_staff() THEN RETURN false; END IF;
 IF NOT public.pm_phase_a_financial_file_gate(_bucket,_name) OR NOT public.pm_phase_a_file_gate(_bucket,_name) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.financial_documents d WHERE d.file_path=_name AND (d.project_id IS NOT NULL OR d.project_expense_id IS NOT NULL) AND public.pm_phase_a_queue_gate(d.project_id,d.project_expense_id,d.direction::text)) OR EXISTS(SELECT 1 FROM public.financial_document_review_queue q WHERE q.source_bucket=_bucket AND (q.source_file_url=_name OR q.split_of_file_url=_name) AND (q.created_project_id IS NOT NULL OR q.source_project_expense_id IS NOT NULL) AND public.pm_phase_a_queue_gate(q.created_project_id,q.source_project_expense_id,q.direction::text));
END $$;
REVOKE ALL ON FUNCTION public.pm_phase_a_financial_file_grant(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_phase_a_financial_file_grant(text,text) TO authenticated,service_role;
CREATE POLICY phase_a_project_financial_file_read ON storage.objects FOR SELECT TO authenticated USING(public.pm_phase_a_financial_file_grant(bucket_id,name));
COMMENT ON FUNCTION public.pm_phase_a_financial_file_grant(text,text) IS 'Phase A project-area SELECT grant for linked financial attachments only; no module Finance, upload/write access, orphan files or bypass of shared-file restrictive gates.';