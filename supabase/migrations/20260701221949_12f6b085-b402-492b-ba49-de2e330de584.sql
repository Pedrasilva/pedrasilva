ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quote_stages.is_optional IS
  'When true, this stage (and all its descendants) is an optional service — excluded from the contract total and shown separately as "Optional Services".';

CREATE INDEX IF NOT EXISTS idx_quote_stages_optional
  ON public.quote_stages (quote_id) WHERE is_optional = true;