DO $patch$ DECLARE s text; BEGIN
 s:=pg_get_functiondef('public.fin_register_issued_document(jsonb,jsonb,uuid)'::regprocedure);
 s:=replace(s,'(original.doc_type IS DISTINCT FROM dtype AND NOT (original.doc_type=''receipt'' AND ft=''FR''))','original.doc_type IS DISTINCT FROM dtype');
 s:=replace(s,'(l->>''quantity'')::numeric <=0 OR (l->>''unit_price_ex_vat'')::numeric<0 OR (l->>''vat_rate'')::numeric<0','coalesce((l->>''quantity'')::numeric,0)<=0 OR coalesce((l->>''unit_price_ex_vat'')::numeric,-1)<0 OR coalesce((l->>''vat_rate'')::numeric,-1)<0');
 s:=replace(s,'IF cid IS NULL OR NOT EXISTS','IF dt IS NULL THEN RAISE EXCEPTION ''Issue date required''; END IF; IF cid IS NULL OR NOT EXISTS');
 s:=replace(s,'IF origin=''saft'' THEN','IF origin=''saft'' THEN IF (_header->>''subtotal_ex_vat'') IS NULL OR (_header->>''vat_amount'') IS NULL OR (_header->>''total_inc_vat'') IS NULL THEN RAISE EXCEPTION ''SAF-T totals required''; END IF;');
 s:=replace(s,'IF ft NOT IN (''FT'',''FR'',''FS'',''NC'') OR','IF ft IS NULL OR fn IS NULL OR ft NOT IN (''FT'',''FR'',''FS'',''NC'') OR');
 s:=replace(s,'payment_schedule_item_id,sort_order)','payment_schedule_item_id,sort_order,classification_id,vat_code,reimbursable,notes)');
 s:=replace(s,'coalesce((l->>''sort_order'')::integer,0));','coalesce((l->>''sort_order'')::integer,0),(l->>''classification_id'')::uuid,l->>''vat_code'',coalesce((l->>''reimbursable'')::boolean,false),l->>''notes'');');
 EXECUTE s;
END $patch$;