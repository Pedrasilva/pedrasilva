ALTER TABLE public.fee_proposals DROP CONSTRAINT fee_proposals_proposal_number_key;
ALTER TABLE public.fee_proposals ADD CONSTRAINT fee_proposals_number_revision_key UNIQUE (proposal_number, revision_number);
COMMENT ON CONSTRAINT fee_proposals_number_revision_key ON public.fee_proposals IS 'A proposal work number is shared by revisions; existing numbers are never renumbered.';
CREATE OR REPLACE FUNCTION public.allocate_proposal_number(p_date date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_year text; v_seq integer;
BEGIN
 IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 v_year := to_char(p_date,'YY');
 INSERT INTO public.fee_proposal_number_counters(year_prefix,last_seq,updated_at) VALUES(v_year,1,now())
 ON CONFLICT(year_prefix) DO UPDATE SET last_seq=public.fee_proposal_number_counters.last_seq+1,updated_at=now()
 RETURNING last_seq INTO v_seq;
 RETURN v_year || CASE WHEN v_seq<10 THEN '0' || v_seq::text ELSE v_seq::text END;
END;
$function$;
DO $migration$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('public.clone_fee_proposal_as_revision_impl(uuid)'::regprocedure);
 IF position('SELECT coalesce(max(revision_number), 0) INTO v_max_rev' in definition)=0 OR position('titulo, company_id, contact_id, valor, probabilidade, pipeline_status,' in definition)=0 THEN
  RAISE EXCEPTION 'Unexpected revision implementation; no change applied';
 END IF;
 definition := replace(definition,'  SELECT coalesce(max(revision_number), 0) INTO v_max_rev', '  -- Serialize every revision in the work family, including legacy numbers.
  PERFORM 1 FROM public.fee_proposals WHERE id = v_root FOR UPDATE;
  SELECT coalesce(max(revision_number), 0) INTO v_max_rev');
 definition := replace(definition,'WHERE id = v_root OR parent_quote_id = v_root;', 'WHERE id = v_root OR parent_quote_id = v_root
     OR proposal_number = (SELECT proposal_number FROM public.fee_proposals WHERE id = p_source);');
 definition := replace(definition,'    titulo, company_id, contact_id, valor, probabilidade, pipeline_status,','    proposal_number, titulo, company_id, contact_id, valor, probabilidade, pipeline_status,');
 definition := replace(definition, '    titulo || '' (rev '' || (v_max_rev + 1) || '')'', company_id, contact_id, valor,', '    proposal_number, titulo, company_id, contact_id, valor,');
 EXECUTE definition;
END;
$migration$;