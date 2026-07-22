ALTER TABLE public.psa_image_library ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE public.psa_image_library DROP CONSTRAINT IF EXISTS psa_image_library_category_chk;
ALTER TABLE public.psa_image_library ADD CONSTRAINT psa_image_library_category_chk CHECK (category IN ('general','residential','workplace','hospitality','team'));
CREATE INDEX IF NOT EXISTS idx_psa_image_library_category ON public.psa_image_library (category);