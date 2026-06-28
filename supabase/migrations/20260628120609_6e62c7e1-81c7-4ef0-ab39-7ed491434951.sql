ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_by uuid NULL;

CREATE INDEX IF NOT EXISTS fee_proposals_archived_at_idx ON public.fee_proposals (archived_at);