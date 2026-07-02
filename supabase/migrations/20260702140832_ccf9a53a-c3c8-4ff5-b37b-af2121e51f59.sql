
CREATE TABLE public.quote_site_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.quote_stages(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT 'Site trip',
  km numeric NOT NULL DEFAULT 0,
  price_per_km numeric NOT NULL DEFAULT 0,
  trip_hours numeric NOT NULL DEFAULT 0,
  resource_id uuid REFERENCES public.pm_resources(id) ON DELETE SET NULL,
  resource_hourly_rate numeric NOT NULL DEFAULT 0,
  frequency_mode text NOT NULL DEFAULT 'per_month' CHECK (frequency_mode IN ('per_month','total')),
  frequency_value numeric NOT NULL DEFAULT 1,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_site_trips_quote ON public.quote_site_trips(quote_id, sort_order);
CREATE INDEX idx_quote_site_trips_stage ON public.quote_site_trips(stage_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_site_trips TO authenticated;
GRANT ALL ON public.quote_site_trips TO service_role;

ALTER TABLE public.quote_site_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage site trips"
  ON public.quote_site_trips
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_quote_site_trips_updated_at
  BEFORE UPDATE ON public.quote_site_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
