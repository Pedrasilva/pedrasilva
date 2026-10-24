-- Meta's own failure reason for the last connection test (never the token).
ALTER TABLE public.marketing_settings
  ADD COLUMN IF NOT EXISTS meta_error_call text,
  ADD COLUMN IF NOT EXISTS meta_error_code integer,
  ADD COLUMN IF NOT EXISTS meta_error_subcode integer,
  ADD COLUMN IF NOT EXISTS meta_error_type text,
  ADD COLUMN IF NOT EXISTS meta_error_message text,
  ADD COLUMN IF NOT EXISTS meta_error_fbtrace_id text;
COMMENT ON COLUMN public.marketing_settings.meta_error_message IS 'Redacted Meta error message from the last connection test; tokens and URLs are stripped before saving.';