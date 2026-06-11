ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS approved_by_collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL;