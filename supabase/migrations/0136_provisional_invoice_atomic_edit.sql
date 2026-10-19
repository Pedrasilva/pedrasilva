CREATE OR REPLACE FUNCTION public.fin_edit_issued_document(_id uuid,_header jsonb,_lines jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.financial_documents%ROWTYPE; l jsonb; n numeric:=0; v numeric:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard') OR public.has_module_permission(auth.uid(),'finance.documents.edit','all')) THEN RAISE EXCEPTION 'Finance edit access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.financial_documents WHERE id=_id AND direction='issued' AND public.fin_row_visible(entity_id) FOR UPDATE;
 IF NOT FOUND OR d.status IN ('cancelled','paid') OR d.invoicexpress_id IS NOT NULL THEN RAISE EXCEPTION 'Invoice cannot be edited'; END IF;
 IF jsonb_typeof(_lines)<>'array' OR jsonb_array_length(_lines)=0 OR jsonb_array_length(_lines)>500 THEN RAISE EXCEPTION 'Invoice lines required'; END IF;
 IF _header->>'doc_type'='client_credit_note' AND nullif(_header->>'original_document_id','') IS NULL THEN RAISE EXCEPTION 'Original invoice required'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  IF coalesce(l->>'description','')='' OR coalesce((l->>'quantity')::numeric,0)<=0 OR coalesce((l->>'unit_price_ex_vat')::numeric,-1)<0 OR coalesce((l->>'vat_rate')::numeric,-1)<0 THEN RAISE EXCEPTION 'Invalid invoice line'; END IF;
  n:=n+round((l->>'quantity')::numeric*(l->>'unit_price_ex_vat')::numeric,2);
  v:=v+round((l->>'quantity')::numeric*(l->>'unit_price_ex_vat')::numeric*(l->>'vat_rate')::numeric/100,2);
 END LOOP;
 IF d.status<>'draft' AND cardinality(d.fiscal_review_reasons)>0 AND (d.document_number IS DISTINCT FROM _header->>'document_number' OR d.doc_type::text IS DISTINCT FROM _header->>'doc_type' OR d.subtotal_ex_vat<>n OR d.vat_amount<>v) THEN RAISE EXCEPTION 'Flagged invoice requires separate review'; END IF;
 UPDATE public.financial_documents SET document_number=_header->>'document_number',series=_header->>'series',doc_type=(_header->>'doc_type')::public.financial_doc_type,issue_date=(_header->>'issue_date')::date,due_date=(_header->>'due_date')::date,counterparty_client_id=(_header->>'counterparty_client_id')::uuid,counterparty_name_snapshot=_header->>'counterparty_name_snapshot',project_id=(_header->>'project_id')::uuid,classification_id=(_header->>'classification_id')::uuid,notes=_header->>'notes',external_reference=_header->>'external_reference',original_document_id=(_header->>'original_document_id')::uuid,status=CASE WHEN d.status='draft' AND _header->>'status'='issued' THEN 'issued'::public.financial_doc_status ELSE d.status END,subtotal_ex_vat=n,vat_amount=v,total_inc_vat=n+v WHERE id=_id;
 DELETE FROM public.financial_document_lines WHERE document_id=_id;
 FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  INSERT INTO public.financial_document_lines(document_id,description,quantity,unit_price_ex_vat,vat_rate,vat_code,classification_id,project_id,payment_schedule_item_id,reimbursable,notes,sort_order)
  VALUES(_id,l->>'description',(l->>'quantity')::numeric,(l->>'unit_price_ex_vat')::numeric,(l->>'vat_rate')::numeric,l->>'vat_code',(l->>'classification_id')::uuid,(l->>'project_id')::uuid,(l->>'payment_schedule_item_id')::uuid,coalesce((l->>'reimbursable')::boolean,false),l->>'notes',coalesce((l->>'sort_order')::integer,0));
 END LOOP;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.fin_edit_issued_document(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_edit_issued_document(uuid,jsonb,jsonb) TO authenticated,service_role;