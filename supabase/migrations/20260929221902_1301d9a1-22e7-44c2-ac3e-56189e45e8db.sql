-- lovable-cron-fallback-reviewed: user specified 5-minute enrichment cron offset from intake; captures arrive via intake poll, matching its cadence.
ALTER TABLE public.marketing_captures
  ADD COLUMN IF NOT EXISTS ai_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_project_guess text,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enriched_bible_version integer,
  ADD COLUMN IF NOT EXISTS enrichment_model text,
  ADD COLUMN IF NOT EXISTS enrichment_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrichment_error text;

CREATE INDEX IF NOT EXISTS marketing_captures_enrich_queue_idx
  ON public.marketing_captures (received_at) WHERE status = 'new' AND enrichment_attempts < 3;

CREATE TABLE public.marketing_project_story_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.marketing_project_profiles(id) ON DELETE CASCADE,
  capture_id uuid REFERENCES public.marketing_captures(id) ON DELETE SET NULL,
  field text NOT NULL CHECK (field IN ('client_ambition','central_idea','challenges','proud_of','key_facts')),
  suggested_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_story_sugg_profile_idx ON public.marketing_project_story_suggestions (profile_id, status);

GRANT SELECT, UPDATE ON public.marketing_project_story_suggestions TO authenticated;
GRANT ALL ON public.marketing_project_story_suggestions TO service_role;
ALTER TABLE public.marketing_project_story_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY mpss_select ON public.marketing_project_story_suggestions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.marketing_project_profiles p WHERE p.id = profile_id AND (
  public.has_module_permission(auth.uid(),'marketing.curate','all')
  OR (public.has_module_permission(auth.uid(),'marketing.contribute','own')
      AND public.marketing_is_project_team_member(auth.uid(), p.project_id)))));
CREATE POLICY mpss_update ON public.marketing_project_story_suggestions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.marketing_project_profiles p WHERE p.id = profile_id AND (
  public.has_module_permission(auth.uid(),'marketing.curate','all')
  OR (public.has_module_permission(auth.uid(),'marketing.contribute','own')
      AND public.marketing_is_project_team_member(auth.uid(), p.project_id)))))
WITH CHECK (EXISTS (SELECT 1 FROM public.marketing_project_profiles p WHERE p.id = profile_id AND (
  public.has_module_permission(auth.uid(),'marketing.curate','all')
  OR (public.has_module_permission(auth.uid(),'marketing.contribute','own')
      AND public.marketing_is_project_team_member(auth.uid(), p.project_id)))));

CREATE OR REPLACE FUNCTION public.marketing_story_suggestions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.capture_id IS DISTINCT FROM OLD.capture_id OR NEW.field IS DISTINCT FROM OLD.field
     OR NEW.suggested_text IS DISTINCT FROM OLD.suggested_text OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only status can change on a story suggestion';
  END IF;
  NEW.reviewed_by := auth.uid();
  NEW.reviewed_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_story_suggestions_guard BEFORE UPDATE ON public.marketing_project_story_suggestions
FOR EACH ROW EXECUTE FUNCTION public.marketing_story_suggestions_guard();

-- Accept: append text to profile field + mark accepted, one transaction. Runs as caller (RLS + profile trigger apply).
CREATE OR REPLACE FUNCTION public.marketing_accept_story_suggestion(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.marketing_project_story_suggestions WHERE id = _id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found or already reviewed'; END IF;
  EXECUTE format(
    'UPDATE public.marketing_project_profiles SET %1$I = CASE WHEN coalesce(trim(%1$I),'''') = '''' THEN $1 ELSE %1$I || E''\n\n'' || $1 END WHERE id = $2',
    s.field) USING s.suggested_text, s.profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed to edit this profile'; END IF;
  UPDATE public.marketing_project_story_suggestions SET status = 'accepted' WHERE id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_accept_story_suggestion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_accept_story_suggestion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_effective_clearance(_capture_id uuid)
RETURNS public.marketing_clearance LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (
    SELECT c.clearance AS own, p.clearance AS proj
    FROM public.marketing_captures c
    LEFT JOIN public.marketing_project_profiles p ON p.project_id = c.project_id
    WHERE c.id = _capture_id
      AND (auth.uid() IS NULL
           OR public.has_module_permission(auth.uid(),'marketing.view','all')
           OR c.created_by = auth.uid())
  ), ranked AS (
    SELECT x.cl, CASE x.cl WHEN 'internal_only' THEN 0 WHEN 'needs_client_approval' THEN 1
                          WHEN 'unknown' THEN 2 ELSE 3 END AS r
    FROM v, LATERAL (VALUES (v.own), (v.proj)) AS x(cl)
    WHERE x.cl IS NOT NULL
  )
  SELECT cl FROM ranked ORDER BY r LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_effective_clearance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_effective_clearance(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'marketing_enrich_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'marketing_enrich_secret',
      'Shared secret for /api/public/hooks/marketing-enrich'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_enrich_secret_matches(p_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT coalesce(p_secret, '') <> '' AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'marketing_enrich_secret' AND decrypted_secret = p_secret
  );
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_enrich_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_enrich_secret_matches(text) TO service_role;

SELECT cron.unschedule('marketing-enrich-every-5-min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketing-enrich-every-5-min');

SELECT cron.schedule(
  'marketing-enrich-every-5-min',
  '2-59/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app/api/public/hooks/marketing-enrich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-enrich-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'marketing_enrich_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);