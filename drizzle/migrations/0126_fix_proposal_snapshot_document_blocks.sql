CREATE OR REPLACE FUNCTION public.build_fee_proposal_snapshot(_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  snap JSONB;
BEGIN
  IF NOT public.is_psa_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'proposal', (SELECT to_jsonb(p) FROM public.fee_proposals p WHERE p.id = _proposal_id),
    'quote_stages', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stages t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_allocations', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_allocations t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_external_services', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_external_services t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_payment_schedule_items', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_payment_schedule_items t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_stage_dependencies', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stage_dependencies t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_supplier_phase_splits', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_supplier_phase_splits t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_stage_supplier_costs', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stage_supplier_costs t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_proposal_documents', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_proposal_documents t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_proposal_document_blocks', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_proposal_document_blocks t
       WHERE t.proposal_document_id IN (SELECT id FROM public.quote_proposal_documents WHERE quote_id = _proposal_id)), '[]'::jsonb)
  )
  INTO snap;
  RETURN snap;
END;
$function$;