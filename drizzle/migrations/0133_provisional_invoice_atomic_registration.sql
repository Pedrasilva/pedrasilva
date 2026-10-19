CREATE OR REPLACE FUNCTION public.fin_register_issued_document(_header jsonb, _lines jsonb, _existing_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e uuid; doc_id uuid; candidate uuid; original public.financial_documents%ROWTYPE; l jsonb; n numeric:=0; v numeric:=0; g numeric; ft text; fs text; fn text; cid uuid; dt date; origin text; dtype public.financial_doc_type; j jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'finance.dashboard')) THEN RAISE EXCEPTION 'Finance access required' USING ERRCODE='42501'; END IF;
 e:=public.current_finance_entity();
 IF e IS NULL OR NOT public.fin_row_visible(e) THEN RAISE EXCEPTION 'Entity access required' USING ERRCODE='42501'; END IF;
 origin:=coalesce(_header->>'registration_origin','manual'); dtype:=(_header->>'doc_type')::public.financial_doc_type;
 IF dtype NOT IN ('client_invoice','client_credit_note','receipt') OR origin NOT IN ('manual','upload','saft','invoicexpress') THEN RAISE EXCEPTION 'Not an issued document'; END IF;
 cid:=(_header->>'counterparty_client_id')::uuid; dt:=(_header->>'issue_date')::date;
 IF cid IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=cid) THEN RAISE EXCEPTION 'Client required'; END IF;
 IF jsonb_typeof(_lines)<>'array' OR jsonb_array_length(_lines)=0 OR jsonb_array_length(_lines)>500 THEN RAISE EXCEPTION 'Invoice lines required'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  IF coalesce(l->>'description','')='' OR (l->>'quantity')::numeric <=0 OR (l->>'unit_price_ex_vat')::numeric<0 OR (l->>'vat_rate')::numeric<0 THEN RAISE EXCEPTION 'Invalid invoice line'; END IF;
  n:=n+round((l->>'quantity')::numeric*(l->>'unit_price_ex_vat')::numeric,2);
  v:=v+round((l->>'quantity')::numeric*(l->>'unit_price_ex_vat')::numeric*(l->>'vat_rate')::numeric/100,2);
 END LOOP;
 g:=n+v;
 IF origin='saft' THEN
  ft:=_header->>'fiscal_type';fs:=_header->>'fiscal_series';fn:=_header->>'fiscal_number';
  IF ft NOT IN ('FT','FR','FS','NC') OR nullif(fs,'') IS NULL OR fn !~ '^[0-9]+$' OR dtype IS DISTINCT FROM (CASE WHEN ft='NC' THEN 'client_credit_note'::public.financial_doc_type ELSE 'client_invoice'::public.financial_doc_type END) THEN RAISE EXCEPTION 'Invalid fiscal identity'; END IF;
  IF abs(n-(_header->>'subtotal_ex_vat')::numeric)>.01 OR abs(v-(_header->>'vat_amount')::numeric)>.01 OR abs(g-(_header->>'total_inc_vat')::numeric)>.01 THEN RAISE EXCEPTION 'SAF-T totals differ'; END IF;
 ELSE
  j:=public.fin_fiscal_identity(dtype::text,_header->>'document_number',_header->>'series'); ft:=j->>'type';fs:=j->>'series';fn:=j->>'number';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e::text,0));
 SELECT id INTO candidate FROM public.financial_documents WHERE entity_id=e AND direction='issued' AND status<>'cancelled' AND fiscal_type=ft AND fiscal_series=fs AND fiscal_number=fn;
 IF candidate IS NOT NULL AND candidate IS DISTINCT FROM _existing_id THEN RAISE EXCEPTION 'Fiscal document already exists' USING ERRCODE='23505'; END IF;
 IF _existing_id IS NOT NULL THEN
  SELECT * INTO original FROM public.financial_documents WHERE id=_existing_id AND entity_id=e AND direction='issued' FOR UPDATE;
  IF NOT FOUND OR original.status='cancelled' OR origin<>'saft' OR (original.fiscal_type IS NOT NULL AND original.fiscal_series IS NOT NULL AND original.fiscal_number IS NOT NULL AND cardinality(original.fiscal_review_reasons)=0) THEN RAISE EXCEPTION 'Existing document cannot be completed'; END IF;
  IF cardinality(original.fiscal_review_reasons)>0 THEN RAISE EXCEPTION 'Flagged document requires separate review'; END IF;
  IF original.counterparty_client_id IS DISTINCT FROM cid OR original.issue_date IS DISTINCT FROM dt OR abs(original.total_inc_vat-g)>.01 OR abs(original.subtotal_ex_vat-n)>.01 OR abs(original.vat_amount-v)>.01 OR original.doc_type IS DISTINCT FROM dtype THEN RAISE EXCEPTION 'Existing document values differ'; END IF;
  UPDATE public.financial_documents SET fiscal_type=ft,fiscal_series=fs,fiscal_number=fn,import_metadata=_header->'import_metadata' WHERE id=_existing_id;
  RETURN _existing_id;
 END IF;
 IF origin='saft' AND EXISTS(SELECT 1 FROM public.financial_documents WHERE entity_id=e AND direction='issued' AND status<>'cancelled' AND counterparty_client_id=cid AND issue_date=dt AND abs(total_inc_vat-g)<=.01 AND (fiscal_type IS NULL OR fiscal_series IS NULL OR fiscal_number IS NULL OR cardinality(fiscal_review_reasons)>0)) THEN RAISE EXCEPTION 'Review possible existing document before creating'; END IF;
 IF (_header->>'project_id') IS NULL AND NOT coalesce((_header->>'not_project_related')::boolean,false) THEN RAISE EXCEPTION 'Select a project'; END IF;
 INSERT INTO public.financial_documents(entity_id,doc_type,direction,status,source,registration_origin,document_number,series,fiscal_type,fiscal_series,fiscal_number,issue_date,counterparty_client_id,counterparty_name_snapshot,project_id,not_project_related,subtotal_ex_vat,vat_amount,total_inc_vat,original_document_id,file_path,notes,import_metadata)
 VALUES(e,dtype,'issued',CASE WHEN _header->>'status'='cancelled' THEN 'cancelled'::public.financial_doc_status ELSE 'issued'::public.financial_doc_status END,'manual',origin,_header->>'document_number',_header->>'series',ft,fs,fn,dt,cid,_header->>'counterparty_name_snapshot',(_header->>'project_id')::uuid,coalesce((_header->>'not_project_related')::boolean,false),n,v,g,(_header->>'original_document_id')::uuid,_header->>'file_path',_header->>'notes',_header->'import_metadata') RETURNING id INTO doc_id;
 FOR l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  INSERT INTO public.financial_document_lines(document_id,description,quantity,unit_price_ex_vat,vat_rate,project_id,payment_schedule_item_id,sort_order)
  VALUES(doc_id,l->>'description',(l->>'quantity')::numeric,(l->>'unit_price_ex_vat')::numeric,(l->>'vat_rate')::numeric,coalesce((l->>'project_id')::uuid,(_header->>'project_id')::uuid),(l->>'payment_schedule_item_id')::uuid,coalesce((l->>'sort_order')::integer,0));
 END LOOP;
 RETURN doc_id;
END $$;
REVOKE ALL ON FUNCTION public.fin_register_issued_document(jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_register_issued_document(jsonb,jsonb,uuid) TO authenticated,service_role;