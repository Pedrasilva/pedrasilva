ALTER TABLE public.quote_stages
  ALTER COLUMN is_self SET DEFAULT true;

UPDATE public.quote_stages
SET is_self = true
WHERE is_self = false
  AND stage_role = 'architecture'
  AND supplier_id IS NULL
  AND supplier_company_id IS NULL
  AND NULLIF(btrim(supplier_placeholder), '') IS NULL;

UPDATE public.psa_proposal_blocks AS b
SET source_ref = COALESCE(b.source_ref, '{}'::jsonb)
  - 'quote_id' - 'stage_id' - 'parent_stage_id'
FROM public.psa_proposals AS p
WHERE p.id = b.proposal_id
  AND (
    (b.source_ref ? 'quote_id' AND b.source_ref ->> 'quote_id' IS DISTINCT FROM p.quote_id::text)
    OR (
      b.source_ref ? 'stage_id'
      AND NOT EXISTS (
        SELECT 1
        FROM public.quote_stages AS s
        WHERE s.id::text = b.source_ref ->> 'stage_id'
          AND s.quote_id = p.quote_id
      )
    )
    OR (
      b.source_ref ? 'parent_stage_id'
      AND NOT EXISTS (
        SELECT 1
        FROM public.quote_stages AS s
        WHERE s.id::text = b.source_ref ->> 'parent_stage_id'
          AND s.quote_id = p.quote_id
      )
    )
  );