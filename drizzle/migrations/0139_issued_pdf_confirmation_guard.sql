DO $patch$ DECLARE s text; BEGIN
 s:=pg_get_functiondef('public.fin_register_issued_document(jsonb,jsonb,uuid)'::regprocedure);
 s:=replace(s,'PERFORM pg_advisory_xact_lock',E'IF origin=''upload'' THEN PERFORM 1 FROM public.financial_document_review_queue WHERE id=(_header->>''queue_item_id'')::uuid AND entity_id=e AND direction=''issued'' AND doc_type IN (''fatura'',''nota_credito'') AND status=''pending_review'' AND source_file_url=_header->>''file_path'' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION ''Confirmed issued PDF required'' USING ERRCODE=''23514''; END IF; END IF;\n PERFORM pg_advisory_xact_lock');
 s:=replace(s,'RETURN doc_id;',E'IF origin=''upload'' THEN UPDATE public.financial_document_review_queue SET status=''approved'',created_expense_id=doc_id,created_project_id=(_header->>''project_id'')::uuid,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=(_header->>''queue_item_id'')::uuid; END IF;\n RETURN doc_id;');
 EXECUTE s;
END $patch$;