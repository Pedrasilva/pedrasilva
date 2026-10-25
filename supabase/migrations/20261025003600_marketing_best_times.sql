CREATE TABLE public.marketing_ig_follower_activity (
  captured_on date PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  account_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('available','unsupported','unavailable')),
  metric text NOT NULL DEFAULT 'online_followers',
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text
);
GRANT SELECT ON public.marketing_ig_follower_activity TO authenticated;
GRANT ALL ON public.marketing_ig_follower_activity TO service_role;
REVOKE ALL ON public.marketing_ig_follower_activity FROM anon;
REVOKE TRUNCATE ON public.marketing_ig_follower_activity FROM anon, authenticated;
ALTER TABLE public.marketing_ig_follower_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_follower_activity_read ON public.marketing_ig_follower_activity FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'marketing.view', 'all'));
CREATE FUNCTION public.marketing_best_times_data() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'posts', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (
      SELECT DISTINCT ON (media_id) media_id, captured_on, media_type, media_product_type, posted_at, metrics
      FROM public.marketing_ig_media_insights
      WHERE posted_at >= now() - interval '90 days' AND posted_at <= now()
      ORDER BY media_id, captured_on DESC, captured_at DESC
    ) p), '[]'::jsonb),
    'activity', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM (
      SELECT captured_on, captured_at, status, metric, slots, error_code FROM public.marketing_ig_follower_activity
      WHERE captured_on >= (now() AT TIME ZONE 'Europe/Lisbon')::date - 90 ORDER BY captured_on DESC
    ) a), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.marketing_best_times_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_best_times_data() TO authenticated, service_role;