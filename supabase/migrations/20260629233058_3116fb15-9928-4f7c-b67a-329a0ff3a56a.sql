ALTER TABLE public.psa_proposals
  ADD COLUMN IF NOT EXISTS style_settings jsonb NOT NULL DEFAULT '{}'::jsonb;