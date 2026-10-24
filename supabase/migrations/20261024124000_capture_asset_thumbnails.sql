ALTER TABLE public.marketing_capture_assets ADD COLUMN IF NOT EXISTS thumb_path text;
ALTER TABLE public.marketing_capture_assets ADD COLUMN IF NOT EXISTS thumb_size_bytes integer;
COMMENT ON COLUMN public.marketing_capture_assets.thumb_path IS 'Storage path (marketing-assets bucket) of the ~600px WebP card thumbnail; never a URL. Service-written.';