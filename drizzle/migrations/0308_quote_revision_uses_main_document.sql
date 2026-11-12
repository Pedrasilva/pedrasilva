DO $$ DECLARE d text; old text:=E'SELECT id INTO v_source_proposal_id\n  FROM public.psa_proposals\n  WHERE quote_id = p_source\n  ORDER BY updated_at DESC, created_at DESC\n  LIMIT 1;'; BEGIN
 d:=pg_get_functiondef('public.clone_fee_proposal_as_revision_impl(uuid)'::regprocedure);
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Unexpected revision selector; refusing replacement'; END IF;
 d:=replace(d,old,'SELECT main_proposal_id INTO v_source_proposal_id FROM public.fee_proposals WHERE id=p_source;');
 EXECUTE d;
END $$;