DO $$ DECLARE body text; BEGIN
 SELECT pg_get_functiondef('public.pm_retainer_sync()'::regprocedure) INTO body;
 body:=replace(body,'IF NEW.stage_kind<>''retainer_monthly'' OR pg_trigger_depth()>1 THEN RETURN NEW; END IF;','IF NEW.stage_kind<>''retainer_monthly'' OR pg_trigger_depth()>1 OR coalesce(current_setting(''pm.retainer_conversion'',true),'''')=''yes'' THEN RETURN NEW; END IF;');
 EXECUTE body;
 SELECT pg_get_functiondef('public.pm_convert_relative_quote(uuid,date,text)'::regprocedure) INTO body;
 body:=replace(body,'FOR s IN SELECT * FROM quote_stages WHERE quote_id=_quote ORDER BY sort_order,id LOOP','PERFORM set_config(''pm.retainer_conversion'',''yes'',true); FOR s IN SELECT * FROM quote_stages WHERE quote_id=_quote ORDER BY sort_order,id LOOP');
 body:=replace(body,'RETURN jsonb_build_object(''id'',project_id_new','PERFORM set_config(''pm.retainer_conversion'','''',true); RETURN jsonb_build_object(''id'',project_id_new');
 EXECUTE body;
END $$;
-- Extend through the same month/date synchronizer; commercial history is added for each new month.
CREATE OR REPLACE FUNCTION public.pm_gantt_extend_retainer(_stage uuid,_months integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.pm_stages;
BEGIN
 SELECT * INTO s FROM pm_stages WHERE id=_stage FOR UPDATE;
 IF s.id IS NULL OR s.stage_kind<>'retainer_monthly' OR NOT pm_can_edit_gantt(s.project_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _months IS NULL OR _months<1 OR coalesce(s.retainer_months,0)+_months>120 THEN RAISE EXCEPTION 'Invalid month count'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gantt:'||'project:'||s.project_id::text,0));
 UPDATE pm_stages SET retainer_months=coalesce(s.retainer_months,0)+_months WHERE id=_stage;
 RETURN jsonb_build_object('monthsAdded',_months);
END $$;