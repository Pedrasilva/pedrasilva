ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS fee_source_mode text NOT NULL DEFAULT 'allocation'
  CHECK (fee_source_mode IN ('allocation','budget'));