DO $patch$
DECLARE s text;
BEGIN
 s:=pg_get_functiondef('public.fin_register_issued_document(jsonb,jsonb,uuid)'::regprocedure);
 s:=replace(s,'public.has_permission(auth.uid(),''finance.dashboard'')','public.has_permission_v2(auth.uid(),''finance.documents.edit'')');
 s:=replace(s,'origin:=coalesce',E'IF _header->>''registration_origin''=''saft'' AND NOT EXISTS(SELECT 1 FROM public.pm_invoice_settings WHERE entity_id=e AND project_id IS NULL AND regexp_replace(company_nif,''[^0-9]'','''',''g'')=regexp_replace(_header->>''issuer_tax_id'',''[^0-9]'','''',''g'')) THEN RAISE EXCEPTION ''SAF-T issuer differs from selected entity''; END IF;\n IF _header->>''doc_type''=''client_credit_note'' AND nullif(_header->>''original_document_id'','''') IS NULL THEN RAISE EXCEPTION ''Original invoice required''; END IF;\n origin:=coalesce');
 s:=replace(s,'IF cardinality(original.fiscal_review_reasons)>0 THEN RAISE EXCEPTION ''Flagged document requires separate review''; END IF;','IF NOT coalesce((_header->>''confirm_completion'')::boolean,false) THEN RAISE EXCEPTION ''Explicit completion confirmation required''; END IF;');
 s:=replace(s,'original.doc_type IS DISTINCT FROM dtype','(original.doc_type IS DISTINCT FROM dtype AND NOT (original.doc_type=''receipt'' AND ft=''FR''))');
 s:=replace(s,'UPDATE public.financial_documents SET fiscal_type=ft,fiscal_series=fs,fiscal_number=fn,import_metadata=_header->''import_metadata'' WHERE id=_existing_id;', 'UPDATE public.financial_documents SET fiscal_type=ft,fiscal_series=fs,fiscal_number=fn,import_metadata=_header->''import_metadata'' WHERE id=_existing_id;');
 s:=replace(s,'RETURN doc_id;', E'UPDATE public.financial_documents SET due_date=(_header->>''due_date'')::date,external_reference=_header->>''external_reference'',classification_id=(_header->>''classification_id'')::uuid WHERE id=doc_id;\n RETURN doc_id;');
 EXECUTE s;
END $patch$;
COMMENT ON FUNCTION public.fin_register_issued_document(jsonb,jsonb,uuid) IS 'Invoker/RLS-scoped atomic registration. SAF-T issuer and explicit existing completion confirmation required; review flags, original values, statuses, text and project assignments retained.';