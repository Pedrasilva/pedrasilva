ALTER TABLE public.fee_proposals ADD COLUMN main_proposal_id uuid;
COMMENT ON COLUMN public.fee_proposals.main_proposal_id IS 'Persistent composer/workflow/history document; not commercial content. Never infer from title or update recency.';
ALTER TABLE public.psa_proposals ADD CONSTRAINT psa_proposals_quote_document_unique UNIQUE (quote_id,id);
ALTER TABLE public.fee_proposals ADD CONSTRAINT fee_proposals_main_document_fk FOREIGN KEY(id,main_proposal_id) REFERENCES public.psa_proposals(quote_id,id) DEFERRABLE INITIALLY DEFERRED;
UPDATE public.fee_proposals q SET main_proposal_id=p.id FROM (SELECT quote_id,(array_agg(id))[1] id FROM public.psa_proposals WHERE quote_id IS NOT NULL GROUP BY quote_id HAVING count(*)=1) p WHERE q.id=p.quote_id;
UPDATE public.fee_proposals SET main_proposal_id='84e54031-64db-41d8-aa30-b22d882a6017' WHERE id='d73deb33-a0f9-41bb-ad4d-637cd5d159b6';
CREATE FUNCTION public.quote_claim_first_document() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.quote_id IS NOT NULL THEN
  UPDATE public.fee_proposals q SET main_proposal_id=NEW.id WHERE q.id=NEW.quote_id AND q.main_proposal_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.psa_proposals p WHERE p.quote_id=NEW.quote_id AND p.id<>NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quote_claim_first_document AFTER INSERT ON public.psa_proposals FOR EACH ROW EXECUTE FUNCTION public.quote_claim_first_document();
DO $$ DECLARE n text; d text; BEGIN
 FOREACH n IN ARRAY ARRAY['crm_quote_content_hash','crm_quote_snapshot_matches','crm_quote_lifecycle'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=n;
  d:=replace(d,'''accepted_content_hash'']','''accepted_content_hash'',''main_proposal_id'']');
  IF n='crm_quote_lifecycle' THEN
   d:=replace(d,'p.quote_id=_quote AND s.kind=', 'p.quote_id=_quote AND p.id=v_quote.main_proposal_id AND s.kind=');
   d:=replace(d,'WHERE quote_id=_quote AND status=', 'WHERE quote_id=_quote AND id=v_quote.main_proposal_id AND status=');
   d:=replace(d,'''proposalId'',v_sent.proposal_id','''proposalId'',v_quote.main_proposal_id');
  ELSE
   d:=replace(d,'WHERE p.quote_id=_quote','WHERE p.quote_id=_quote AND p.id=(SELECT main_proposal_id FROM public.fee_proposals WHERE id=_quote)');
   d:=replace(d,'AND p.quote_id=_quote AND s.kind=', 'AND p.quote_id=_quote AND p.id=(SELECT main_proposal_id FROM public.fee_proposals WHERE id=_quote) AND s.kind=');
  END IF;
  EXECUTE d;
 END LOOP;
END $$;