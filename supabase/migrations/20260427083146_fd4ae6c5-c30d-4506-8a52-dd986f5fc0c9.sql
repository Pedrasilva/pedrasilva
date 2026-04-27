-- Add quote_type enum and column to fee_proposals
CREATE TYPE public.crm_quote_type AS ENUM (
  'standard_project',
  'construction_retainer',
  'consultancy_hours_package'
);

ALTER TABLE public.fee_proposals
  ADD COLUMN quote_type public.crm_quote_type NOT NULL DEFAULT 'standard_project',
  ADD COLUMN time_based_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: existing rows already get default 'standard_project' via DEFAULT.
-- Explicit update kept for clarity / future-proofing.
UPDATE public.fee_proposals SET quote_type = 'standard_project' WHERE quote_type IS NULL;

CREATE INDEX IF NOT EXISTS fee_proposals_quote_type_idx
  ON public.fee_proposals (quote_type);