CREATE TABLE public.quote_billable_hourly_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  hourly_rate numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, collaborator_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_billable_hourly_rates TO authenticated;
GRANT ALL ON public.quote_billable_hourly_rates TO service_role;

ALTER TABLE public.quote_billable_hourly_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read billable rates"
  ON public.quote_billable_hourly_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert billable rates"
  ON public.quote_billable_hourly_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update billable rates"
  ON public.quote_billable_hourly_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete billable rates"
  ON public.quote_billable_hourly_rates FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_quote_billable_hourly_rates_updated_at
  BEFORE UPDATE ON public.quote_billable_hourly_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_quote_billable_hourly_rates_quote ON public.quote_billable_hourly_rates(quote_id);