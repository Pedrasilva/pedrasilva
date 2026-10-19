CREATE OR REPLACE FUNCTION public.fin_assign_invoice_project(_id uuid,_project_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.financial_documents%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard') OR public.has_module_permission(auth.uid(),'finance.documents.edit','all')) THEN RAISE EXCEPTION 'Finance edit access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.financial_documents WHERE id=_id AND direction='issued' AND public.fin_row_visible(entity_id) FOR UPDATE;
 IF NOT FOUND OR d.project_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.financial_document_lines WHERE document_id=_id AND project_id IS NOT NULL) THEN RAISE EXCEPTION 'Document already has project attribution'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pm_projects WHERE id=_project_id) THEN RAISE EXCEPTION 'Project access required' USING ERRCODE='42501'; END IF;
 IF d.entity_id<>'00000000-0000-4000-a000-000000000001'::uuid THEN RAISE EXCEPTION 'PSA project required'; END IF;
 UPDATE public.financial_documents SET project_id=_project_id,not_project_related=false WHERE id=_id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.fin_assign_invoice_project(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_assign_invoice_project(uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fin_confirm_receipt_invoice_link(_id uuid,_invoice_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.financial_documents%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard') OR public.has_module_permission(auth.uid(),'finance.documents.edit','all')) THEN RAISE EXCEPTION 'Finance edit access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.financial_documents WHERE id=_id AND direction='issued' AND doc_type='receipt' AND public.fin_row_visible(entity_id) FOR UPDATE;
 IF NOT FOUND OR d.original_document_id IS NOT NULL OR NOT (_invoice_id=ANY(d.receipt_invoice_candidates)) THEN RAISE EXCEPTION 'Receipt suggestion not available'; END IF;
 UPDATE public.financial_documents SET original_document_id=_invoice_id WHERE id=_id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.fin_confirm_receipt_invoice_link(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_confirm_receipt_invoice_link(uuid,uuid) TO authenticated,service_role;