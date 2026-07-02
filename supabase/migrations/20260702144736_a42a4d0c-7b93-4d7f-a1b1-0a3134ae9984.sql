ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS date_mode text NOT NULL DEFAULT 'calculated'
  CHECK (date_mode IN ('calculated','fixed'));