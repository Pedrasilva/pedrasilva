-- Issued PDF drafts reuse the existing queue -> document relationship; no new columns.
CREATE OR REPLACE FUNCTION public.fin_save_issued_pdf_draft(_queue_id uuid, _header jsonb, _lines jsonb, _document_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE q public.financial_document_review_queue%ROWTYPE; d public.financial_documents%ROWTYPE; doc_id uuid; e uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard') OR public.has_module_permission(auth.uid(),'finance.documents.edit','all')) THEN RAISE EXCEPTION 'Finance edit access required' USING ERRCODE='42501'; END IF;
 e := public.current_finance_entity();
 SELECT * INTO q FROM public.financial_document_review_queue WHERE id=_queue_id AND entity_id=e AND public.fin_row_visible(entity_id) FOR UPDATE;
 IF NOT FOUND OR q.direction<>'issued' OR q.intake_type NOT IN ('fatura_emitida','nota_credito') OR q.status<>'pending_review' OR q.source_file_url IS DISTINCT FROM _header->>'file_path' THEN RAISE EXCEPTION 'Pending issued PDF required' USING ERRCODE='23514'; END IF;
 IF _header->>'status' NOT IN ('draft','issued') OR _header->>'registration_origin' IS DISTINCT FROM 'upload' OR _header->>'doc_type' NOT IN ('client_invoice','client_credit_note') THEN RAISE EXCEPTION 'Issued PDF draft required' USING ERRCODE='23514'; END IF;
 IF _document_id IS NULL THEN
  IF q.created_expense_id IS NOT NULL OR _header->>'status' IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'PDF already linked or draft required' USING ERRCODE='23514'; END IF;
  -- Explicit entity assignment precedes all document reference validation. Existing triggers remain unchanged.
  INSERT INTO public.financial_documents(entity_id,doc_type,direction,status,source,registration_origin,document_number,series,issue_date,due_date,counterparty_client_id,counterparty_name_snapshot,project_id,not_project_related,classification_id,currency,notes,external_reference,original_document_id,file_path,subtotal_ex_vat,vat_amount,total_inc_vat)
  VALUES(q.entity_id,(_header->>'doc_type')::public.financial_doc_type,'issued','draft','manual','upload',_header->>'document_number',_header->>'series',(_header->>'issue_date')::date,(_header->>'due_date')::date,(_header->>'counterparty_client_id')::uuid,_header->>'counterparty_name_snapshot',(_header->>'project_id')::uuid,coalesce((_header->>'not_project_related')::boolean,false),(_header->>'classification_id')::uuid,coalesce(_header->>'currency','EUR'),_header->>'notes',_header->>'external_reference',(_header->>'original_document_id')::uuid,q.source_file_url,0,0,0) RETURNING id INTO doc_id;
 ELSE
  SELECT * INTO d FROM public.financial_documents WHERE id=_document_id AND entity_id=q.entity_id AND direction='issued' FOR UPDATE;
  IF NOT FOUND OR d.status<>'draft' OR d.registration_origin<>'upload' OR d.file_path IS DISTINCT FROM q.source_file_url OR q.created_expense_id IS DISTINCT FROM _document_id THEN RAISE EXCEPTION 'Linked PDF draft required' USING ERRCODE='23514'; END IF;
  doc_id := _document_id;
 END IF;
 -- Reuse existing atomic line validation, fiscal guards and edit semantics; never touch payments/banking.
 PERFORM public.fin_edit_issued_document(doc_id,_header,_lines);
 UPDATE public.financial_document_review_queue SET created_expense_id=doc_id,created_project_id=(_header->>'project_id')::uuid,
  status=CASE WHEN _header->>'status'='issued' THEN 'filed'::public.fdrq_status ELSE q.status END,
  reviewed_by=CASE WHEN _header->>'status'='issued' THEN auth.uid() ELSE q.reviewed_by END,
  reviewed_at=CASE WHEN _header->>'status'='issued' THEN now() ELSE q.reviewed_at END
 WHERE id=q.id AND entity_id=q.entity_id;
 RETURN doc_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fin_save_issued_pdf_draft(uuid,jsonb,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_save_issued_pdf_draft(uuid,jsonb,jsonb,uuid) TO authenticated;
