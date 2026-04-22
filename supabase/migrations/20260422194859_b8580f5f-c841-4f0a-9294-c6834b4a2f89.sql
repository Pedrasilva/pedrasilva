
ALTER TABLE public.bo_settings
  ADD COLUMN IF NOT EXISTS utilization_target_min numeric NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS utilization_target_max numeric NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS internal_threshold_pct numeric NOT NULL DEFAULT 20;
