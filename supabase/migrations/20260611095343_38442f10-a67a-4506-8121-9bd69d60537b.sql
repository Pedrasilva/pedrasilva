ALTER TABLE public.pm_stages
  ADD COLUMN IF NOT EXISTS stage_kind text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'stage',
  ADD COLUMN IF NOT EXISTS retainer_monthly_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retainer_anchor_month date,
  ADD COLUMN IF NOT EXISTS retainer_months integer,
  ADD COLUMN IF NOT EXISTS retainer_capacity_hours_per_month integer NOT NULL DEFAULT 160,
  ADD COLUMN IF NOT EXISTS is_fee_only boolean NOT NULL DEFAULT true;

ALTER TABLE public.pm_stages
  DROP CONSTRAINT IF EXISTS pm_stages_stage_kind_check;
ALTER TABLE public.pm_stages
  ADD CONSTRAINT pm_stages_stage_kind_check
  CHECK (stage_kind = ANY (ARRAY['regular'::text, 'retainer_monthly'::text]));

ALTER TABLE public.pm_stages
  DROP CONSTRAINT IF EXISTS pm_stages_billing_model_chk;
ALTER TABLE public.pm_stages
  ADD CONSTRAINT pm_stages_billing_model_chk
  CHECK (billing_model = ANY (ARRAY['stage'::text, 'monthly'::text, 'retainer'::text]));