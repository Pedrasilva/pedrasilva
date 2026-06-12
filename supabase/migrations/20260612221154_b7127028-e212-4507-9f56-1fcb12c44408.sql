ALTER TABLE public.quote_stages ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false;
ALTER TABLE public.pm_stages ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false;