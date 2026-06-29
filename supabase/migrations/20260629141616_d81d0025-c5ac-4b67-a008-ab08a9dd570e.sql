
ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS is_self boolean NOT NULL DEFAULT true;

-- Backfill from quote_stages via the contract baseline. Match on name + sort_order
-- for the same project (sort_order is copied 1:1 during convert).
UPDATE public.pm_stages s
SET is_self = qs.is_self
FROM public.pm_project_contract_baseline b
JOIN public.quote_stages qs ON qs.quote_id = b.quote_id
WHERE s.project_id = b.project_id
  AND qs.name = s.name
  AND COALESCE(qs.sort_order, 0) = COALESCE(s.sort_order, 0);
