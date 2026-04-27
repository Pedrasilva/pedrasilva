ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS project_fee_calculation jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.fee_proposals.project_fee_calculation IS
  'Inputs and computed results of the construction-percentage architectural fee calculator. Project Proposals only.';