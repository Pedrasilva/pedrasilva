ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS lost_reason_code text,
  ADD COLUMN IF NOT EXISTS lost_reason_notes text,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;

ALTER TABLE public.crm_opportunities
  DROP CONSTRAINT IF EXISTS crm_opportunities_lost_reason_code_check;

ALTER TABLE public.crm_opportunities
  ADD CONSTRAINT crm_opportunities_lost_reason_code_check
  CHECK (lost_reason_code IS NULL OR lost_reason_code IN (
    'price', 'competitor', 'postponed', 'no_budget', 'no_response', 'not_a_fit', 'other'
  ));