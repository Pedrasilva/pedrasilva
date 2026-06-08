-- Phase 1: Retainer-as-monthly-template data model.
--
-- Extends quote_stages with fields needed to represent a construction
-- retainer as: a 1-month allocation template (start_date..end_date span
-- one calendar month = retainer_anchor_month) that repeats N times
-- (retainer_months). Monthly fee is computed from quote_allocations on
-- that stage; total stage budget = monthly_fee * retainer_months.
--
-- Existing 'retainer' billing_model rows (legacy time_based_settings
-- JSONB driven) are NOT migrated; new quotes will populate the new
-- columns when stage_kind='retainer_monthly'.

-- Discriminator: keeps the new model isolated from the legacy
-- billing_model='retainer' rows so existing UI/code paths keep working.
ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS stage_kind text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS retainer_months integer,
  ADD COLUMN IF NOT EXISTS retainer_anchor_month date,
  ADD COLUMN IF NOT EXISTS retainer_capacity_hours_per_month integer NOT NULL DEFAULT 160;

ALTER TABLE public.quote_stages
  DROP CONSTRAINT IF EXISTS quote_stages_stage_kind_check;
ALTER TABLE public.quote_stages
  ADD CONSTRAINT quote_stages_stage_kind_check
  CHECK (stage_kind IN ('regular', 'retainer_monthly'));

ALTER TABLE public.quote_stages
  DROP CONSTRAINT IF EXISTS quote_stages_retainer_monthly_fields_check;
ALTER TABLE public.quote_stages
  ADD CONSTRAINT quote_stages_retainer_monthly_fields_check
  CHECK (
    stage_kind <> 'retainer_monthly'
    OR (retainer_months IS NOT NULL
        AND retainer_months BETWEEN 1 AND 120
        AND retainer_anchor_month IS NOT NULL
        AND retainer_capacity_hours_per_month > 0)
  );

COMMENT ON COLUMN public.quote_stages.stage_kind IS
  'regular = standard phase; retainer_monthly = 1-month allocation template repeating retainer_months times';
COMMENT ON COLUMN public.quote_stages.retainer_anchor_month IS
  'First-of-month date that the allocation template represents (start_date/end_date are constrained to this month for retainer_monthly stages)';
COMMENT ON COLUMN public.quote_stages.retainer_capacity_hours_per_month IS
  'Capacity basis for converting allocation_percentage into hours_per_month (default 160)';
