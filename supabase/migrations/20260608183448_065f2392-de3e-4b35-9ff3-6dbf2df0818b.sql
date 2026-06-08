
ALTER TABLE public.pm_time_entries
  ADD COLUMN IF NOT EXISTS cost_rate_snapshot numeric(10,2),
  ADD COLUMN IF NOT EXISTS sale_rate_snapshot numeric(10,2);
