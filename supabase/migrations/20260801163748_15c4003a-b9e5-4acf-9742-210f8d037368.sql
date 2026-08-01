DO $$
DECLARE r RECORD; new_id uuid;
BEGIN
  FOR r IN SELECT id, titulo, company_id, quote_status, valor, proposal_number, created_at
           FROM public.fee_proposals
           WHERE opportunity_id IS NULL AND deleted_at IS NULL
  LOOP
    INSERT INTO public.crm_opportunities (name, company_id, stage, estimated_fee, probability, notas, created_at)
    VALUES (
      COALESCE(NULLIF(r.titulo, ''), 'Proposta ' || COALESCE(r.proposal_number::text, '')),
      r.company_id,
      CASE WHEN r.quote_status = 'approved' THEN 'won'::crm_opportunity_stage
           WHEN r.quote_status = 'rejected' THEN 'lost'::crm_opportunity_stage
           WHEN r.quote_status = 'sent' THEN 'proposal'::crm_opportunity_stage
           ELSE 'lead'::crm_opportunity_stage END,
      COALESCE(r.valor, 0),
      CASE WHEN r.quote_status = 'approved' THEN 100 WHEN r.quote_status = 'rejected' THEN 0 ELSE 50 END,
      'Migrado do pipeline legado (proposta ' || COALESCE(r.proposal_number::text, '—') || ')',
      r.created_at
    ) RETURNING id INTO new_id;
    UPDATE public.fee_proposals SET opportunity_id = new_id WHERE id = r.id;
  END LOOP;
END $$;