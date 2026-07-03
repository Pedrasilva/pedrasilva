
ALTER TABLE public.proposal_roles
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC NOT NULL DEFAULT 0;

-- The role catalog is now the source of truth. Drop the earlier temporary table.
DROP TABLE IF EXISTS public.billable_hourly_rates;
