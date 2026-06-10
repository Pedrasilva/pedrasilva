ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS retainer_review_months smallint NULL;

ALTER TABLE public.pm_stages
  ADD COLUMN IF NOT EXISTS retainer_review_months smallint NULL;

COMMENT ON COLUMN public.quote_stages.retainer_review_months IS 'For retainer-style stages: how often (in months) we reconcile clocked hours vs billed amount. Typical values 3 or 6.';
COMMENT ON COLUMN public.pm_stages.retainer_review_months IS 'For retainer-style stages: how often (in months) we reconcile clocked hours vs billed amount. Typical values 3 or 6.';