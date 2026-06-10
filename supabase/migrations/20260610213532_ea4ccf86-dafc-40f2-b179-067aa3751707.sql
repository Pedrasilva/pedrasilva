ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS approved_by_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;