CREATE TABLE public.marketing_ig_media_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id text NOT NULL,
  captured_on date NOT NULL,
  media_type text,
  media_product_type text,
  caption text,
  permalink text,
  thumbnail text,
  posted_at timestamptz,
  draft_id uuid,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  unavailable_metrics text[] NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_id, captured_on)
);
GRANT SELECT ON public.marketing_ig_media_insights TO authenticated;
GRANT ALL ON public.marketing_ig_media_insights TO service_role;
REVOKE TRUNCATE ON public.marketing_ig_media_insights FROM anon, authenticated;
ALTER TABLE public.marketing_ig_media_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY mig_media_insights_read ON public.marketing_ig_media_insights FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE INDEX marketing_ig_media_insights_day_idx ON public.marketing_ig_media_insights (captured_on DESC);

CREATE TABLE public.marketing_ig_account_insights (
  captured_on date PRIMARY KEY,
  followers integer,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  unavailable_metrics text[] NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketing_ig_account_insights TO authenticated;
GRANT ALL ON public.marketing_ig_account_insights TO service_role;
REVOKE TRUNCATE ON public.marketing_ig_account_insights FROM anon, authenticated;
ALTER TABLE public.marketing_ig_account_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY mig_account_insights_read ON public.marketing_ig_account_insights FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.view','all'));

CREATE TABLE public.marketing_insight_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  model text NOT NULL,
  period_from date,
  period_to date,
  post_count integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL,
  input_summary jsonb NOT NULL
);
GRANT SELECT ON public.marketing_insight_analyses TO authenticated;
GRANT ALL ON public.marketing_insight_analyses TO service_role;
REVOKE TRUNCATE ON public.marketing_insight_analyses FROM anon, authenticated;
ALTER TABLE public.marketing_insight_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY mig_insight_analyses_read ON public.marketing_insight_analyses FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE INDEX marketing_insight_analyses_time_idx ON public.marketing_insight_analyses (created_at DESC);

ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS instagram_insights_synced_at timestamptz;
ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS instagram_insights_error text;