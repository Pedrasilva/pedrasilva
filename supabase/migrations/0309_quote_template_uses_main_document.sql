DO $$ DECLARE d text; old text:='SELECT to_jsonb(r) INTO p FROM public.psa_proposals r WHERE quote_id=_quote ORDER BY updated_at DESC,id LIMIT 1;'; BEGIN
 d:=pg_get_functiondef('public.quote_template_capture(uuid)'::regprocedure);
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected template selector; refusing replacement'; END IF;
 EXECUTE replace(d,old,'SELECT to_jsonb(r) INTO p FROM public.psa_proposals r WHERE quote_id=_quote AND id=(SELECT main_proposal_id FROM public.fee_proposals WHERE id=_quote);');
END $$;