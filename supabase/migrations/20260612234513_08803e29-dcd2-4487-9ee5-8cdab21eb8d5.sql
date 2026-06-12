ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS budget_mode text NOT NULL DEFAULT 'calculated',
  ADD COLUMN IF NOT EXISTS stage_billing_timing text NOT NULL DEFAULT 'end';

ALTER TABLE public.quote_stages
  DROP CONSTRAINT IF EXISTS quote_stages_budget_mode_chk;
ALTER TABLE public.quote_stages
  ADD CONSTRAINT quote_stages_budget_mode_chk
  CHECK (budget_mode IN ('calculated', 'fixed'));

ALTER TABLE public.quote_stages
  DROP CONSTRAINT IF EXISTS quote_stages_billing_timing_chk;
ALTER TABLE public.quote_stages
  ADD CONSTRAINT quote_stages_billing_timing_chk
  CHECK (stage_billing_timing IN ('end', 'start', 'split'));