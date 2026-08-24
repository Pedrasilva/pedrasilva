ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_method text,
  ADD COLUMN IF NOT EXISTS signed_notes text,
  ADD COLUMN IF NOT EXISTS signed_by_collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL;

ALTER TABLE public.fee_proposals
  DROP CONSTRAINT IF EXISTS fee_proposals_signed_method_check;

ALTER TABLE public.fee_proposals
  ADD CONSTRAINT fee_proposals_signed_method_check
  CHECK (signed_method IS NULL OR signed_method IN ('docusign','manual'));

CREATE INDEX IF NOT EXISTS fee_proposals_signed_at_idx ON public.fee_proposals (signed_at);