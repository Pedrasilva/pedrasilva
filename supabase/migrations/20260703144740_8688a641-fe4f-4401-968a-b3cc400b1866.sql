ALTER TABLE public.quote_billable_hourly_rates DROP CONSTRAINT IF EXISTS quote_billable_hourly_rates_collaborator_id_fkey;
ALTER TABLE public.quote_billable_hourly_rates DROP CONSTRAINT IF EXISTS quote_billable_hourly_rates_quote_id_collaborator_id_key;
ALTER TABLE public.quote_billable_hourly_rates DROP COLUMN IF EXISTS collaborator_id;
ALTER TABLE public.quote_billable_hourly_rates ADD COLUMN IF NOT EXISTS role_name text NOT NULL DEFAULT '';
ALTER TABLE public.quote_billable_hourly_rates ADD CONSTRAINT quote_billable_hourly_rates_quote_role_unique UNIQUE (quote_id, role_name);