ALTER TABLE public.pm_projects
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'direct';

ALTER TABLE public.pm_projects
  DROP CONSTRAINT IF EXISTS pm_projects_origin_chk;
ALTER TABLE public.pm_projects
  ADD CONSTRAINT pm_projects_origin_chk CHECK (origin IN ('quote_conversion','direct'));

UPDATE public.pm_projects SET origin = 'quote_conversion' WHERE quote_id IS NOT NULL;

ALTER TABLE public.pm_stages
  ADD COLUMN IF NOT EXISTS origin text;

ALTER TABLE public.pm_stages
  DROP CONSTRAINT IF EXISTS pm_stages_origin_chk;
ALTER TABLE public.pm_stages
  ADD CONSTRAINT pm_stages_origin_chk CHECK (origin IS NULL OR origin IN ('original_baseline','added_post_conversion'));

COMMENT ON COLUMN public.pm_stages.origin IS 'original_baseline = copied from the quote at conversion; added_post_conversion = created after conversion; NULL = not applicable (direct-origin project, no sold baseline)';

UPDATE public.pm_stages s
SET origin = CASE
  WHEN s.source_quote_stage_id IS NOT NULL THEN 'original_baseline'
  ELSE 'added_post_conversion'
END
FROM public.pm_projects p
WHERE p.id = s.project_id AND p.origin = 'quote_conversion';

ALTER TABLE public.pm_stages DROP CONSTRAINT IF EXISTS pm_stages_billing_model_chk;
ALTER TABLE public.pm_stages
  ADD CONSTRAINT pm_stages_billing_model_chk CHECK (billing_model IN ('stage','monthly','retainer','hourly'));