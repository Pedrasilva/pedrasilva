-- Marketing carousel composer: hand-built carousels with text slides and comments.
ALTER TABLE public.marketing_project_media DROP CONSTRAINT marketing_project_media_kind_check;
ALTER TABLE public.marketing_project_media ADD CONSTRAINT marketing_project_media_kind_check
  CHECK (kind = ANY (ARRAY['photo','diagram','drawing','text_slide']));

ALTER TABLE public.marketing_post_requests ADD COLUMN origin text NOT NULL DEFAULT 'planner'
  CHECK (origin IN ('planner','composer'));

CREATE TABLE public.marketing_compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.marketing_project_profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  intent text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  idea_id uuid,
  duplicated_from uuid REFERENCES public.marketing_compositions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_compositions_profile_idx ON public.marketing_compositions(profile_id);

CREATE TABLE public.marketing_composition_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  composition_id uuid NOT NULL REFERENCES public.marketing_compositions(id) ON DELETE CASCADE,
  position int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','text')),
  media_id uuid REFERENCES public.marketing_project_media(id) ON DELETE RESTRICT,
  capture_asset_id uuid REFERENCES public.marketing_capture_assets(id) ON DELETE RESTRICT,
  text_heading text,
  text_body text,
  design_media_id uuid REFERENCES public.marketing_project_media(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcs_shape CHECK (
    (kind = 'image' AND num_nonnulls(media_id, capture_asset_id) = 1 AND design_media_id IS NULL)
    OR (kind = 'text' AND media_id IS NULL AND capture_asset_id IS NULL AND text_heading IS NOT NULL AND length(trim(text_heading)) > 0)
  )
);
CREATE INDEX marketing_composition_slides_comp_idx ON public.marketing_composition_slides(composition_id, position);
CREATE INDEX marketing_composition_slides_media_idx ON public.marketing_composition_slides(media_id);
CREATE INDEX marketing_composition_slides_design_idx ON public.marketing_composition_slides(design_media_id);
CREATE INDEX marketing_composition_slides_asset_idx ON public.marketing_composition_slides(capture_asset_id);

CREATE TABLE public.marketing_composition_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  composition_id uuid NOT NULL REFERENCES public.marketing_compositions(id) ON DELETE CASCADE,
  slide_id uuid REFERENCES public.marketing_composition_slides(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL DEFAULT auth.uid(),
  text text NOT NULL CHECK (length(trim(text)) > 0),
  audio_path text,
  nudge_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_composition_comments_comp_idx ON public.marketing_composition_comments(composition_id, created_at);

ALTER TABLE public.marketing_nudges ADD COLUMN composition_id uuid REFERENCES public.marketing_compositions(id);
CREATE INDEX marketing_nudges_composition_idx ON public.marketing_nudges(composition_id);
ALTER TABLE public.marketing_nudges DROP CONSTRAINT marketing_nudges_capture_kind_check;
ALTER TABLE public.marketing_nudges ADD CONSTRAINT marketing_nudges_capture_kind_check
  CHECK (kind = 'briefing' OR capture_id IS NOT NULL OR composition_id IS NOT NULL);

-- Helpers
CREATE OR REPLACE FUNCTION public.marketing_can_edit_composition(_user_id uuid, _composition_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.marketing_compositions c
    WHERE c.id = _composition_id AND public.marketing_can_brief_profile(_user_id, c.profile_id))
$$;
CREATE OR REPLACE FUNCTION public.marketing_composition_is_draft(_composition_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.marketing_compositions WHERE id = _composition_id AND status = 'draft')
$$;

-- Guards: sent compositions are read-only (except by the service role); slides limited to 20 and to the project's own material.
CREATE OR REPLACE FUNCTION public.marketing_compositions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
    IF OLD.status = 'sent' THEN RAISE EXCEPTION 'This carousel was sent to the planner and is read-only. Duplicate it to make a new version.'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.idea_id IS DISTINCT FROM OLD.idea_id
       OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN NEW.status := 'draft'; NEW.idea_id := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_compositions_guard_trg BEFORE INSERT OR UPDATE ON public.marketing_compositions
  FOR EACH ROW EXECUTE FUNCTION public.marketing_compositions_guard();

CREATE OR REPLACE FUNCTION public.marketing_composition_slides_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE comp public.marketing_compositions; prof public.marketing_project_profiles; n int;
BEGIN
  SELECT * INTO comp FROM public.marketing_compositions WHERE id = COALESCE(NEW.composition_id, OLD.composition_id);
  IF auth.role() IS DISTINCT FROM 'service_role' AND comp.status = 'sent' THEN
    RAISE EXCEPTION 'This carousel was sent to the planner and is read-only. Duplicate it to make a new version.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.composition_id IS DISTINCT FROM OLD.composition_id THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO n FROM public.marketing_composition_slides WHERE composition_id = NEW.composition_id;
    IF n >= 20 THEN RAISE EXCEPTION 'Instagram allows at most 20 slides'; END IF;
  END IF;
  SELECT * INTO prof FROM public.marketing_project_profiles WHERE id = comp.profile_id;
  IF NEW.media_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.marketing_project_media m
      WHERE m.id = NEW.media_id AND m.profile_id = comp.profile_id AND m.kind <> 'text_slide') THEN
    RAISE EXCEPTION 'Photo is not in this project''s library';
  END IF;
  IF NEW.design_media_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.marketing_project_media m
      WHERE m.id = NEW.design_media_id AND m.profile_id = comp.profile_id AND m.kind = 'text_slide') THEN
    RAISE EXCEPTION 'Design must be a text-slide image of this project';
  END IF;
  IF NEW.capture_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.marketing_capture_assets a
      JOIN public.marketing_captures c ON c.id = a.capture_id
      WHERE a.id = NEW.capture_asset_id AND c.project_id = prof.project_id AND a.mime_type LIKE 'image/%') THEN
    RAISE EXCEPTION 'Image is not from this project''s Inbox';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_composition_slides_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.marketing_composition_slides
  FOR EACH ROW EXECUTE FUNCTION public.marketing_composition_slides_guard();

-- Grants + RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_compositions TO authenticated;
GRANT ALL ON public.marketing_compositions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_composition_slides TO authenticated;
GRANT ALL ON public.marketing_composition_slides TO service_role;
GRANT SELECT, INSERT, DELETE ON public.marketing_composition_comments TO authenticated;
GRANT ALL ON public.marketing_composition_comments TO service_role;

ALTER TABLE public.marketing_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_composition_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_composition_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY mco_select ON public.marketing_compositions FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.view', 'all') OR public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mco_insert ON public.marketing_compositions FOR INSERT TO authenticated
  WITH CHECK (public.marketing_can_brief_profile(auth.uid(), profile_id) AND created_by = auth.uid());
CREATE POLICY mco_update ON public.marketing_compositions FOR UPDATE TO authenticated
  USING (public.marketing_can_brief_profile(auth.uid(), profile_id))
  WITH CHECK (public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mco_delete ON public.marketing_compositions FOR DELETE TO authenticated
  USING (status = 'draft' AND public.marketing_can_brief_profile(auth.uid(), profile_id));

CREATE POLICY mcs_select ON public.marketing_composition_slides FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.view', 'all') OR public.marketing_can_edit_composition(auth.uid(), composition_id));
CREATE POLICY mcs_insert ON public.marketing_composition_slides FOR INSERT TO authenticated
  WITH CHECK (public.marketing_can_edit_composition(auth.uid(), composition_id) AND public.marketing_composition_is_draft(composition_id));
CREATE POLICY mcs_update ON public.marketing_composition_slides FOR UPDATE TO authenticated
  USING (public.marketing_can_edit_composition(auth.uid(), composition_id) AND public.marketing_composition_is_draft(composition_id))
  WITH CHECK (public.marketing_can_edit_composition(auth.uid(), composition_id));
CREATE POLICY mcs_delete ON public.marketing_composition_slides FOR DELETE TO authenticated
  USING (public.marketing_can_edit_composition(auth.uid(), composition_id) AND public.marketing_composition_is_draft(composition_id));

CREATE POLICY mcc_select ON public.marketing_composition_comments FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.view', 'all') OR public.marketing_can_edit_composition(auth.uid(), composition_id));
CREATE POLICY mcc_insert ON public.marketing_composition_comments FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.has_module_permission(auth.uid(), 'marketing.view', 'all'));
CREATE POLICY mcc_delete ON public.marketing_composition_comments FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));

-- Nudge guard: composition_id is protected too.
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
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.briefing_id IS DISTINCT FROM OLD.briefing_id
     OR NEW.composition_id IS DISTINCT FROM OLD.composition_id THEN
    RAISE EXCEPTION 'Only the answer can be changed';
  END IF;
  RETURN NEW;
END $function$;

-- Library photos used in a carousel can't be deleted.
CREATE OR REPLACE FUNCTION public.marketing_media_delete_block(_media_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids) AND status = 'published') THEN 'published'
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids)) THEN
      'drafts:' || (SELECT count(*) FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids))::text
    WHEN EXISTS (SELECT 1 FROM marketing_composition_slides WHERE media_id = _media_id OR design_media_id = _media_id) THEN
      'compositions:' || (SELECT count(DISTINCT composition_id) FROM marketing_composition_slides WHERE media_id = _media_id OR design_media_id = _media_id)::text
    ELSE NULL END
$function$;