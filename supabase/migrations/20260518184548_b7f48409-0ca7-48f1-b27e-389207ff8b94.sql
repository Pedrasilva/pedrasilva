-- Add explicit override marker on pm_resources to distinguish a user-set
-- project rate from the legacy table defaults (hourly_rate=100, sale_rate=100,
-- cost_rate=50). Without this, legacy defaults were being treated as "Project
-- overrides" in the UI even though no human ever set them.
ALTER TABLE public.pm_resources
  ADD COLUMN IF NOT EXISTS hourly_rate_is_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pm_resources.hourly_rate_is_override IS
  'TRUE when hourly_rate was explicitly set as a project-level override of the HR-derived 75% default. When FALSE, hourly_rate must be ignored and the HR default used instead.';

-- Backfill: be conservative. Mark as override ONLY when the stored values
-- clearly diverge from the legacy table defaults (hourly_rate=100, sale_rate=100,
-- cost_rate=50). Rows that still match those legacy defaults are assumed to be
-- inherited defaults, not human overrides, and stay at override=false.
UPDATE public.pm_resources
SET hourly_rate_is_override = true
WHERE NOT (hourly_rate = 100 AND sale_rate = 100 AND cost_rate = 50);
