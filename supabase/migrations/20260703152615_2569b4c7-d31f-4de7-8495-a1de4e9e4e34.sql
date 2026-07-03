ALTER TABLE public.quote_site_trips
  ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'role'
    CHECK (display_mode IN ('name', 'role'));