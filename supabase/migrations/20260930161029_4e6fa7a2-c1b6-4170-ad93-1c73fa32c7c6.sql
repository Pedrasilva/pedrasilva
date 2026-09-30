-- A. Carousel vs single
ALTER TABLE public.marketing_captures ADD COLUMN format_hint text NOT NULL DEFAULT 'auto'
  CHECK (format_hint IN ('auto','single','carousel'));
ALTER TABLE public.marketing_capture_assets ADD COLUMN position integer;
UPDATE public.marketing_capture_assets a SET position = x.rn FROM (
  SELECT id, row_number() OVER (PARTITION BY capture_id ORDER BY created_at, id) - 1 AS rn FROM public.marketing_capture_assets
) x WHERE x.id = a.id;

CREATE OR REPLACE FUNCTION public.marketing_capture_assets_position()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT coalesce(max(position) + 1, 0) INTO NEW.position FROM public.marketing_capture_assets WHERE capture_id = NEW.capture_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_capture_assets_position() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER marketing_capture_assets_position BEFORE INSERT ON public.marketing_capture_assets
  FOR EACH ROW EXECUTE FUNCTION public.marketing_capture_assets_position();

CREATE OR REPLACE FUNCTION public.marketing_can_arrange_capture(_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_module_permission(auth.uid(), 'marketing.curate', 'all')
    OR EXISTS (SELECT 1 FROM public.marketing_captures c WHERE c.id = _capture_id AND c.created_by = auth.uid() AND c.status = 'new')
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_can_arrange_capture(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_can_arrange_capture(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_reorder_capture_assets(_capture_id uuid, _asset_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT public.marketing_can_arrange_capture(_capture_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT count(*) INTO _n FROM public.marketing_capture_assets WHERE capture_id = _capture_id;
  IF _n <> coalesce(array_length(_asset_ids, 1), 0)
     OR EXISTS (SELECT 1 FROM unnest(_asset_ids) x(id) WHERE NOT EXISTS (
       SELECT 1 FROM public.marketing_capture_assets a WHERE a.id = x.id AND a.capture_id = _capture_id)) THEN
    RAISE EXCEPTION 'The list must contain every file of this capture exactly once';
  END IF;
  UPDATE public.marketing_capture_assets a SET position = x.ord - 1
    FROM unnest(_asset_ids) WITH ORDINALITY x(id, ord) WHERE a.id = x.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_reorder_capture_assets(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_reorder_capture_assets(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_set_capture_format(_capture_id uuid, _format_hint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.marketing_can_arrange_capture(_capture_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _format_hint NOT IN ('auto','single','carousel') THEN RAISE EXCEPTION 'Invalid format'; END IF;
  UPDATE public.marketing_captures SET format_hint = _format_hint WHERE id = _capture_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_set_capture_format(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_set_capture_format(uuid, text) TO authenticated;

ALTER TABLE public.marketing_post_drafts
  ADD COLUMN format text NOT NULL DEFAULT 'single' CHECK (format IN ('single','carousel','story')),
  ADD COLUMN ai_story_frames jsonb,
  ADD COLUMN final_story_frames jsonb;
ALTER TABLE public.marketing_post_drafts DISABLE TRIGGER USER;
UPDATE public.marketing_post_drafts SET format = CASE WHEN coalesce(array_length(asset_ids, 1), 0) > 1 THEN 'carousel' ELSE 'single' END;
ALTER TABLE public.marketing_post_drafts ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE res record;
BEGIN
  IF NEW.ai_copy IS DISTINCT FROM OLD.ai_copy OR NEW.ai_hashtags IS DISTINCT FROM OLD.ai_hashtags
     OR NEW.capture_ids IS DISTINCT FROM OLD.capture_ids OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.idea_id IS DISTINCT FROM OLD.idea_id OR NEW.platform IS DISTINCT FROM OLD.platform
     OR NEW.bible_version IS DISTINCT FROM OLD.bible_version OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.format IS DISTINCT FROM OLD.format OR NEW.ai_story_frames IS DISTINCT FROM OLD.ai_story_frames THEN
    RAISE EXCEPTION 'AI original fields of a post draft cannot be changed';
  END IF;
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published'
     AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags
          OR NEW.final_story_frames IS DISTINCT FROM OLD.final_story_frames) THEN
    RAISE EXCEPTION 'Save the edit first, then mark as published.';
  END IF;
  IF (NEW.readiness IS DISTINCT FROM OLD.readiness OR NEW.readiness_note IS DISTINCT FROM OLD.readiness_note
      OR NEW.safety_flags IS DISTINCT FROM OLD.safety_flags)
     AND coalesce(current_setting('marketing.readiness_recheck', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Readiness can only be set by the system recheck';
  END IF;
  NEW.edited_after_approval := OLD.edited_after_approval;

  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags) THEN
    NEW.status := 'suggested';
    NEW.edited_after_approval := true;
    SELECT * INTO res FROM public.marketing_compute_draft_readiness(NEW.capture_ids,
      coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags));
    NEW.readiness := res.readiness; NEW.readiness_note := res.note; NEW.safety_flags := res.flags;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'Only approved drafts can be marked as published';
    END IF;
    IF NEW.status = 'approved' THEN
      SELECT * INTO res FROM public.marketing_compute_draft_readiness(NEW.capture_ids,
        coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags));
      IF res.readiness <> 'ready' THEN
        RAISE EXCEPTION 'This draft can''t be approved: %', coalesce(res.note, res.readiness::text);
      END IF;
      NEW.readiness := res.readiness; NEW.readiness_note := res.note; NEW.safety_flags := res.flags;
      NEW.edited_after_approval := false;
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END $function$;

-- B. Stories
ALTER TABLE public.marketing_post_requests ADD COLUMN story_count integer NOT NULL DEFAULT 0
  CHECK (story_count BETWEEN 0 AND 10);
ALTER TABLE public.marketing_post_requests DROP CONSTRAINT marketing_post_requests_idea_count_check;
ALTER TABLE public.marketing_post_requests ADD CONSTRAINT marketing_post_requests_idea_count_check CHECK (idea_count BETWEEN 0 AND 10);
ALTER TABLE public.marketing_post_requests ADD CONSTRAINT marketing_post_requests_total_check CHECK (idea_count + story_count >= 1);

-- C. Briefings
CREATE TABLE public.marketing_project_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.marketing_project_profiles(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  audio_path text NOT NULL,
  transcript text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','done','failed')),
  error text,
  nudge_id uuid NULL REFERENCES public.marketing_nudges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_project_briefings_profile_idx ON public.marketing_project_briefings(profile_id, created_at DESC);
GRANT SELECT, INSERT ON public.marketing_project_briefings TO authenticated;
GRANT ALL ON public.marketing_project_briefings TO service_role;
ALTER TABLE public.marketing_project_briefings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.marketing_can_brief_profile(_user_id uuid, _profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_module_permission(_user_id, 'marketing.curate', 'all')
    OR (public.has_module_permission(_user_id, 'marketing.contribute', 'own')
        AND EXISTS (SELECT 1 FROM public.marketing_project_profiles p
                    WHERE p.id = _profile_id AND public.marketing_is_project_team_member(_user_id, p.project_id)))
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_can_brief_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_can_brief_profile(uuid, uuid) TO authenticated;

CREATE POLICY mpb_select ON public.marketing_project_briefings FOR SELECT TO authenticated
  USING (public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mpb_insert ON public.marketing_project_briefings FOR INSERT TO authenticated
  WITH CHECK (recorded_by = auth.uid() AND public.marketing_can_brief_profile(auth.uid(), profile_id));

CREATE POLICY marketing_voice_briefings_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-voice' AND (storage.foldername(name))[1] = 'briefings'
         AND public.marketing_can_brief_profile(auth.uid(), ((storage.foldername(name))[2])::uuid));

ALTER TABLE public.marketing_project_story_suggestions DROP CONSTRAINT marketing_project_story_suggestions_source_check;
ALTER TABLE public.marketing_project_story_suggestions ADD CONSTRAINT marketing_project_story_suggestions_source_check
  CHECK (source IN ('ai','architect_answer','architect_briefing'));

ALTER TABLE public.marketing_nudges
  ADD COLUMN kind text NOT NULL DEFAULT 'question' CHECK (kind IN ('question','briefing')),
  ADD COLUMN briefing_id uuid NULL REFERENCES public.marketing_project_briefings(id) ON DELETE SET NULL,
  ALTER COLUMN capture_id DROP NOT NULL;
ALTER TABLE public.marketing_nudges ADD CONSTRAINT marketing_nudges_capture_kind_check CHECK (kind = 'briefing' OR capture_id IS NOT NULL);
ALTER TABLE public.marketing_nudges ADD CONSTRAINT marketing_nudges_briefing_project_check CHECK (kind <> 'briefing' OR project_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.marketing_nudges_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role
  IF public.has_module_permission(auth.uid(), 'marketing.curate', 'all') THEN RETURN NEW; END IF;
  IF auth.uid() <> OLD.architect_user_id THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'This question is no longer open'; END IF;
  IF OLD.expires_at IS NOT NULL AND OLD.expires_at < now() THEN RAISE EXCEPTION 'This question has expired'; END IF;
  IF NEW.status NOT IN ('answered','dismissed') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.capture_id IS DISTINCT FROM OLD.capture_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.architect_user_id IS DISTINCT FROM OLD.architect_user_id
     OR NEW.question IS DISTINCT FROM OLD.question OR NEW.ai_suggested_question IS DISTINCT FROM OLD.ai_suggested_question
     OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.story_suggestion_id IS DISTINCT FROM OLD.story_suggestion_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.briefing_id IS DISTINCT FROM OLD.briefing_id THEN
    RAISE EXCEPTION 'Only the answer can be changed';
  END IF;
  RETURN NEW;
END $function$;

-- Curator list for notifications (service role only)
CREATE OR REPLACE FUNCTION public.marketing_curator_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT u.id FROM auth.users u WHERE public.has_module_permission(u.id, 'marketing.curate', 'all')
$$;
REVOKE EXECUTE ON FUNCTION public.marketing_curator_user_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_curator_user_ids() TO service_role;