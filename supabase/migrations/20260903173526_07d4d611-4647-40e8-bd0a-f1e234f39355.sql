ALTER TABLE public.library_products ADD COLUMN IF NOT EXISTS sample_pdf_path text;
ALTER TABLE public.project_items ADD COLUMN IF NOT EXISTS sample_pdf_path text;
ALTER TABLE public.project_items ADD COLUMN IF NOT EXISTS ref_code text;