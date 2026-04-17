ALTER TABLE public.bo_settings
  ADD COLUMN IF NOT EXISTS margem_lucro_pct numeric NOT NULL DEFAULT 0.25;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS margem_lucro_pct_override numeric;