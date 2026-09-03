ALTER TABLE public.library_products ADD COLUMN IF NOT EXISTS weight text, ADD COLUMN IF NOT EXISTS ref_code text;
ALTER TABLE public.project_items ADD COLUMN IF NOT EXISTS weight text;