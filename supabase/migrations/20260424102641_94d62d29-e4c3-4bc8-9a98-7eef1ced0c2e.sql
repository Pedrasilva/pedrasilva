-- Add tax/VAT number and company type/category to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS nif text,
  ADD COLUMN IF NOT EXISTS company_type text;