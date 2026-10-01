CREATE TABLE public.marketing_project_press_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.marketing_project_profiles(id) ON DELETE CASCADE,
  title text,
  press_text text NOT NULL,
  source_file_path text,
  processed_at timestamptz,
  process_error text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_project_press_kits TO authenticated;
GRANT ALL ON public.marketing_project_press_kits TO service_role;
ALTER TABLE public.marketing_project_press_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY mpk_select ON public.marketing_project_press_kits FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.view','all') OR public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mpk_insert ON public.marketing_project_press_kits FOR INSERT TO authenticated
  WITH CHECK (public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mpk_update ON public.marketing_project_press_kits FOR UPDATE TO authenticated
  USING (public.marketing_can_brief_profile(auth.uid(), profile_id)) WITH CHECK (public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mpk_delete ON public.marketing_project_press_kits FOR DELETE TO authenticated
  USING (public.marketing_can_brief_profile(auth.uid(), profile_id));

CREATE TABLE public.marketing_project_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.marketing_project_profiles(id) ON DELETE CASCADE,
  press_kit_id uuid REFERENCES public.marketing_project_press_kits(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  kind text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo','diagram','drawing')),
  caption_ai text,
  caption text,
  caption_status text NOT NULL DEFAULT 'pending' CHECK (caption_status IN ('pending','ai_draft','confirmed')),
  credit text,
  position int,
  last_used_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_project_media_profile_idx ON public.marketing_project_media(profile_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_project_media TO authenticated;
GRANT ALL ON public.marketing_project_media TO service_role;
ALTER TABLE public.marketing_project_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY mpm_select ON public.marketing_project_media FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.view','all') OR public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mpm_insert ON public.marketing_project_media FOR INSERT TO authenticated
  WITH CHECK (public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mpm_update ON public.marketing_project_media FOR UPDATE TO authenticated
  USING (public.marketing_can_brief_profile(auth.uid(), profile_id)) WITH CHECK (public.marketing_can_brief_profile(auth.uid(), profile_id));
CREATE POLICY mpm_delete ON public.marketing_project_media FOR DELETE TO authenticated
  USING (public.marketing_can_brief_profile(auth.uid(), profile_id));

-- caption_ai is immutable once written; profile/storage path can't move.
CREATE OR REPLACE FUNCTION public.marketing_project_media_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.caption_ai IS NOT NULL AND NEW.caption_ai IS DISTINCT FROM OLD.caption_ai THEN
    RAISE EXCEPTION 'The AI caption is kept as written';
  END IF;
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION 'Media cannot be moved';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_project_media_guard BEFORE UPDATE ON public.marketing_project_media
  FOR EACH ROW EXECUTE FUNCTION public.marketing_project_media_guard();

CREATE OR REPLACE FUNCTION public.marketing_media_delete_block(_media_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids) AND status = 'published') THEN 'published'
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids)) THEN
      'drafts:' || (SELECT count(*) FROM marketing_post_drafts WHERE _media_id = ANY(asset_ids))::text
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.marketing_project_media_guard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE b text := public.marketing_media_delete_block(OLD.id);
BEGIN
  IF b = 'published' THEN RAISE EXCEPTION 'This image is used in a published post and cannot be deleted'; END IF;
  IF b IS NOT NULL THEN RAISE EXCEPTION 'This image is used in post drafts; delete those drafts first'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER marketing_project_media_guard_delete BEFORE DELETE ON public.marketing_project_media
  FOR EACH ROW EXECUTE FUNCTION public.marketing_project_media_guard_delete();

-- Story suggestions may come from a press kit.
ALTER TABLE public.marketing_project_story_suggestions DROP CONSTRAINT marketing_project_story_suggestions_source_check;
ALTER TABLE public.marketing_project_story_suggestions ADD CONSTRAINT marketing_project_story_suggestions_source_check
  CHECK (source IN ('ai','architect_answer','architect_briefing','press_kit'));

-- Library files: marketing-assets/library/<profile_id>/...
CREATE POLICY marketing_library_obj_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-assets' AND (storage.foldername(name))[1] = 'library'
    AND public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE POLICY marketing_library_obj_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-assets' AND (storage.foldername(name))[1] = 'library'
    AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    AND public.marketing_can_brief_profile(auth.uid(), ((storage.foldername(name))[2])::uuid));
CREATE POLICY marketing_library_obj_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-assets' AND (storage.foldername(name))[1] = 'library'
    AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    AND public.marketing_can_brief_profile(auth.uid(), ((storage.foldername(name))[2])::uuid));

-- Publishing stamps last_used_at on library media (captures keep their "used" behaviour).
CREATE OR REPLACE FUNCTION public.marketing_post_drafts_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    UPDATE public.marketing_captures SET status = 'used' WHERE id = ANY (NEW.capture_ids);
    UPDATE public.marketing_project_media SET last_used_at = now() WHERE id = ANY (NEW.asset_ids);
  END IF;
  RETURN NEW;
END $function$;

-- Readiness: optional project (library material) folded in with the same strictest rule.
DROP FUNCTION public.marketing_compute_draft_readiness(uuid[], text, text[]);
CREATE FUNCTION public.marketing_compute_draft_readiness(_capture_ids uuid[], _copy text, _hashtags text[], _project_id uuid DEFAULT NULL,
  OUT readiness marketing_draft_readiness, OUT note text, OUT flags text[])
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  hay text := lower(coalesce(_copy,'') || ' ' || coalesce(array_to_string(_hashtags,' '),''));
  r record; named boolean := false; internal boolean := false; pending text[] := '{}';
  eff public.marketing_clearance;
BEGIN
  FOR r IN
    SELECT c.clearance AS own, c.ai_flags, coalesce(left(c.ai_summary,40), left(c.raw_text,40), c.id::text) AS label,
           p.clearance AS proj, p.name_rule, pr.name AS pname, pr.client AS pclient
    FROM public.marketing_captures c
    LEFT JOIN public.marketing_project_profiles p ON p.project_id = c.project_id
    LEFT JOIN public.pm_projects pr ON pr.id = c.project_id
    WHERE c.id = ANY(_capture_ids)
    UNION ALL
    SELECT NULL::public.marketing_clearance, '{}'::text[], 'Project library: ' || coalesce(left(pr.name,40), p.project_id::text),
           p.clearance, p.name_rule, pr.name, pr.client
    FROM public.marketing_project_profiles p
    LEFT JOIN public.pm_projects pr ON pr.id = p.project_id
    WHERE _project_id IS NOT NULL AND p.project_id = _project_id
  LOOP
    SELECT x.cl INTO eff FROM (VALUES (r.own),(r.proj)) x(cl) WHERE x.cl IS NOT NULL
      ORDER BY CASE x.cl WHEN 'internal_only' THEN 0 WHEN 'needs_client_approval' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END LIMIT 1;
    IF eff = 'internal_only' OR r.name_rule = 'never_mention' THEN internal := true; END IF;
    IF r.name_rule IS NOT NULL AND r.name_rule <> 'name' THEN
      IF (length(trim(coalesce(r.pclient,''))) >= 3 AND position(lower(trim(r.pclient)) IN hay) > 0)
         OR (length(trim(coalesce(r.pname,''))) >= 3 AND position(lower(trim(r.pname)) IN hay) > 0) THEN
        named := true;
      END IF;
    END IF;
    IF eff IS DISTINCT FROM 'cleared' THEN
      pending := pending || (r.label || ' (' || coalesce(eff::text,'unknown') ||
        CASE WHEN coalesce(array_length(r.ai_flags,1),0) > 0 THEN '; flags: ' || array_to_string(r.ai_flags, ', ') ELSE '' END || ')');
    END IF;
  END LOOP;
  flags := '{}';
  IF named THEN flags := flags || 'Names a client that must not be named'::text; END IF;
  IF internal THEN flags := flags || 'Uses internal-only material'::text; END IF;
  IF named OR internal THEN
    readiness := 'blocked'; note := array_to_string(flags, '; ');
  ELSIF coalesce(array_length(pending,1),0) = 0 THEN
    readiness := 'ready'; note := NULL;
  ELSE
    readiness := 'needs_approval'; note := 'Not cleared yet: ' || array_to_string(pending, '; ');
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.marketing_recheck_draft_readiness(_draft_id uuid)
RETURNS marketing_draft_readiness LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d public.marketing_post_drafts; res record; lib uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN
    RAISE EXCEPTION 'Not allowed to recheck drafts';
  END IF;
  SELECT * INTO d FROM public.marketing_post_drafts WHERE id = _draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  SELECT pr.project_id INTO lib FROM public.marketing_project_media m
    JOIN public.marketing_project_profiles pr ON pr.id = m.profile_id
    WHERE m.id = ANY(d.asset_ids) LIMIT 1;
  IF lib IS NULL AND coalesce(array_length(d.capture_ids,1),0) = 0 THEN lib := d.project_id; END IF;
  SELECT * INTO res FROM public.marketing_compute_draft_readiness(d.capture_ids,
    coalesce(d.final_copy, d.ai_copy), coalesce(d.final_hashtags, d.ai_hashtags), lib);
  PERFORM set_config('marketing.readiness_recheck','on',true);
  UPDATE public.marketing_post_drafts SET readiness = res.readiness, readiness_note = res.note, safety_flags = res.flags
    WHERE id = _draft_id;
  PERFORM set_config('marketing.readiness_recheck','off',true);
  RETURN res.readiness;
END $function$;