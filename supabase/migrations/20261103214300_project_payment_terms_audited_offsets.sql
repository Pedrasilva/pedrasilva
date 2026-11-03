ALTER TABLE public.pm_payment_schedule_items ADD COLUMN payment_terms_review_reason text;
CREATE FUNCTION public.pm_parse_payment_terms(_terms text) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE v text; m text[];
BEGIN
 v:=lower(trim(regexp_replace(translate(coalesce(_terms,''),'áàãâéêíóôõúç','aaaaeeiooouc'),'\s+',' ','g')));
 IF v IN ('pronto pagamento','pagamento imediato','immediate payment','payable on receipt','due on receipt','cash on delivery') THEN RETURN 0; END IF;
 m:=regexp_match(v,'^([0-9]{1,3})( [(][a-z ]+[)])? dias( de calendario)?$');
 IF m IS NULL THEN m:=regexp_match(v,'^(net )?([0-9]{1,3}) (calendar )?days$'); IF m IS NOT NULL THEN RETURN m[2]::integer; END IF;
 ELSE RETURN m[1]::integer; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.pm_parse_payment_terms(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_parse_payment_terms(text) TO authenticated,service_role;
CREATE FUNCTION public.pm_payment_offset_exact_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF coalesce(current_setting('pm.offset_admin_action',true),'')='yes' THEN
  NEW.updated_at:=OLD.updated_at;
  IF (to_jsonb(NEW)-'payment_offset_days') IS DISTINCT FROM (to_jsonb(OLD)-'payment_offset_days') THEN RAISE EXCEPTION 'Offset correction may change only payment_offset_days' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_pm_payment_offset_exact_guard BEFORE UPDATE ON public.pm_payment_schedule_items FOR EACH ROW EXECUTE FUNCTION public.pm_payment_offset_exact_guard();
CREATE FUNCTION public.pm_correct_payment_offsets(_rows jsonb,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; b public.pm_payment_schedule_items; a public.pm_payment_schedule_items; n integer:=0; aid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_reason,'')))=0 OR jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)=0 THEN RAISE EXCEPTION 'Reviewed rows and reason required'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_rows))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_rows) x) THEN RAISE EXCEPTION 'Duplicate reviewed row'; END IF;
 FOR r IN SELECT x FROM jsonb_array_elements(_rows) x ORDER BY x->>'id' LOOP
  SELECT * INTO b FROM public.pm_payment_schedule_items WHERE id=(r.x->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR b.project_id IS DISTINCT FROM (r.x->>'project_id')::uuid OR b.payment_offset_days IS DISTINCT FROM (r.x->>'before_offset')::integer OR b.payment_terms IS DISTINCT FROM r.x->>'payment_terms' OR b.billing_status::text IS DISTINCT FROM r.x->>'billing_status' THEN RAISE EXCEPTION 'Reviewed payment changed; reload before correction'; END IF;
  IF b.dates_frozen_at IS NOT NULL OR b.billing_status::text IN ('issued','paid','cancelled') OR EXISTS(SELECT 1 FROM public.financial_document_lines l JOIN public.financial_documents d ON d.id=l.document_id WHERE l.payment_schedule_item_id=b.id AND d.status::text NOT IN ('draft','cancelled')) THEN RAISE EXCEPTION 'Issued or paid payment dates are frozen'; END IF;
  IF public.pm_parse_payment_terms(b.payment_terms) IS DISTINCT FROM (r.x->>'after_offset')::integer OR (r.x->>'after_offset') IS NULL THEN RAISE EXCEPTION 'Offset not evidenced by payment terms'; END IF;
  PERFORM set_config('pm.offset_admin_action','yes',true);
  UPDATE public.pm_payment_schedule_items SET payment_offset_days=(r.x->>'after_offset')::integer WHERE id=b.id RETURNING * INTO a;
  PERFORM set_config('pm.offset_admin_action','',true);
  IF (to_jsonb(a)-'payment_offset_days') IS DISTINCT FROM (to_jsonb(b)-'payment_offset_days') THEN RAISE EXCEPTION 'Other payment fields changed'; END IF;
  INSERT INTO public.pm_payment_date_audit(project_id,payment_item_id,actor,reason,before_values,after_values) VALUES(b.project_id,b.id,auth.uid(),_reason,to_jsonb(b),to_jsonb(a)) RETURNING id INTO aid;
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('changed',n,'only_field','payment_offset_days','reason',_reason);
END $$;
REVOKE ALL ON FUNCTION public.pm_correct_payment_offsets(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pm_correct_payment_offsets(jsonb,text) TO authenticated,service_role;
DO $patch$ DECLARE d text; anchor text; addition text; BEGIN
 SELECT pg_get_functiondef('public.pm_convert_relative_quote(uuid,date,text)'::regprocedure) INTO d;
 anchor:='SELECT string_agg(quote_ident(column_name)';
 IF position(anchor in d)=0 THEN RAISE EXCEPTION 'Conversion payload anchor missing'; END IF;
 addition:='payload:=payload||jsonb_build_object(''payment_offset_days'',public.pm_parse_payment_terms(p.payment_terms),''payment_terms_review_reason'',CASE WHEN public.pm_parse_payment_terms(p.payment_terms) IS NULL THEN CASE WHEN length(trim(coalesce(p.payment_terms,'''')))=0 THEN ''paymentTermsMissing'' ELSE ''paymentTermsUnreadable'' END ELSE NULL END,''expected_payment_date'',CASE WHEN public.pm_parse_payment_terms(p.payment_terms) IS NULL THEN NULL ELSE (payload->>''expected_invoice_date'')::date+public.pm_parse_payment_terms(p.payment_terms) END); ';
 d:=replace(d,anchor,addition||anchor); EXECUTE d;
 SELECT pg_get_functiondef('public.pm_incoming_resolve(uuid)'::regprocedure) INTO d;
 anchor:='v_payment:=coalesce(v_row.planned_payment_date_override,v_invoice+coalesce(v_row.payment_offset_days,0));';
 IF position(anchor in d)=0 THEN RAISE EXCEPTION 'Incoming payment offset anchor missing'; END IF;
 d:=replace(d,anchor,'v_payment:=coalesce(v_row.planned_payment_date_override,CASE WHEN v_row.payment_terms_review_reason IS NULL THEN v_invoice+coalesce(v_row.payment_offset_days,0) END); IF v_row.payment_terms_review_reason IS NOT NULL THEN v_problem:=array_append(v_problem,v_row.payment_terms_review_reason); END IF;'); EXECUTE d;
END $patch$;
COMMENT ON COLUMN public.pm_payment_schedule_items.payment_terms_review_reason IS 'Conversion-only unreadable/missing payment terms flag. No guessed payment date; existing rows are not backfilled.';
COMMENT ON FUNCTION public.pm_correct_payment_offsets(jsonb,text) IS 'Admin-only reviewed, optimistic and atomic correction. Exact row equality except offset; immutable per-row actor/reason audit; frozen evidence rejected.';