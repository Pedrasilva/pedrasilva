
-- 1) HR-level shared table (source of truth for cost per Billing Role)
CREATE TABLE public.billable_hourly_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billable_hourly_rates TO authenticated;
GRANT ALL ON public.billable_hourly_rates TO service_role;

ALTER TABLE public.billable_hourly_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read billable rates"
  ON public.billable_hourly_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert billable rates"
  ON public.billable_hourly_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update billable rates"
  ON public.billable_hourly_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete billable rates"
  ON public.billable_hourly_rates FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_billable_hourly_rates_updated_at
  BEFORE UPDATE ON public.billable_hourly_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed from any existing quote-level entries (average per role, ignore zeros)
INSERT INTO public.billable_hourly_rates (role_name, hourly_rate)
SELECT role_name, ROUND(AVG(hourly_rate)::numeric, 2)
FROM public.quote_billable_hourly_rates
WHERE hourly_rate > 0
GROUP BY role_name
ON CONFLICT (role_name) DO NOTHING;

-- 3) Repurpose the quote-level table: it now only stores the per-quote manual sale rate
ALTER TABLE public.quote_billable_hourly_rates
  RENAME COLUMN hourly_rate TO sale_rate;
