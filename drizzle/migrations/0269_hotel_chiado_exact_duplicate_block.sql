-- Owner-requested deletion, Luis Pedra Silva, 8 November 2026 23:30 UTC.
-- Only the duplicate Estudo Prévio block; preserve every other row verbatim.
BEGIN;
CREATE TEMP TABLE hotel_chiado_blocks_before ON COMMIT DROP AS SELECT * FROM public.psa_proposal_blocks;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.psa_proposals WHERE id='3d0db6b3-4bf5-4681-a875-c553f8c64656' AND quote_id='a9f08834-6fb2-4d4b-8bb1-730f59336da6' AND status='draft') THEN RAISE EXCEPTION 'Expected editable Hotel Chiado proposal missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.psa_proposal_blocks b JOIN public.quote_stages s ON s.id=(b.source_ref->>'stage_id')::uuid WHERE b.id='7d2e3a62-da65-4aaa-889a-5b6a6f8749c6' AND b.proposal_id='3d0db6b3-4bf5-4681-a875-c553f8c64656' AND b.block_type='stage_item' AND b.sort_order=90 AND b.title='Fase (cópia)' AND s.name='Estudo Prévio') THEN RAISE EXCEPTION 'Exact duplicate no longer matches'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.psa_proposal_blocks WHERE id='2d9b0662-984c-41a7-b518-97baea89035b' AND proposal_id='3d0db6b3-4bf5-4681-a875-c553f8c64656' AND sort_order=70) THEN RAISE EXCEPTION 'Original Estudo Prévio missing'; END IF;
END $$;
DELETE FROM public.psa_proposal_blocks WHERE id='7d2e3a62-da65-4aaa-889a-5b6a6f8749c6' AND proposal_id='3d0db6b3-4bf5-4681-a875-c553f8c64656' AND sort_order=90 AND block_type='stage_item' AND title='Fase (cópia)';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.psa_proposal_blocks WHERE id='7d2e3a62-da65-4aaa-889a-5b6a6f8749c6') THEN RAISE EXCEPTION 'Duplicate still exists'; END IF;
  IF EXISTS ((SELECT to_jsonb(b) FROM hotel_chiado_blocks_before b WHERE id<>'7d2e3a62-da65-4aaa-889a-5b6a6f8749c6' EXCEPT SELECT to_jsonb(b) FROM public.psa_proposal_blocks b) UNION ALL (SELECT to_jsonb(b) FROM public.psa_proposal_blocks b EXCEPT SELECT to_jsonb(b) FROM hotel_chiado_blocks_before b WHERE id<>'7d2e3a62-da65-4aaa-889a-5b6a6f8749c6')) THEN RAISE EXCEPTION 'Other block changed; rolling back'; END IF;
END $$;
COMMIT;
