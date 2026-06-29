
-- Seed a sample PSA proposal from the Mastercard quote so the composer can be
-- tested end-to-end. Idempotent: skips if a proposal already targets that quote.
DO $$
DECLARE
  v_quote uuid := '7b4403fc-016f-4d0b-9bc4-823b3c81547d';
  v_proposal uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.psa_proposals WHERE quote_id = v_quote) THEN
    INSERT INTO public.psa_proposals (title, quote_id, status)
    VALUES ('Proposta — 2609 Mastercard', v_quote, 'draft')
    RETURNING id INTO v_proposal;

    INSERT INTO public.psa_proposal_blocks
      (proposal_id, sort_order, block_type, title, source_type,
       source_ref, content_rich, contract_relevance)
    SELECT
      v_proposal,
      (row_number() OVER (ORDER BY sort_hint)) * 10,
      kind,
      default_title,
      default_source_type,
      default_source_ref,
      default_content_rich,
      default_contract_relevance
    FROM public.psa_block_library
    ORDER BY sort_hint;
  END IF;
END $$;
