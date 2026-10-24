ALTER TABLE public.marketing_post_drafts ADD COLUMN IF NOT EXISTS story_render_manifest jsonb;
COMMENT ON COLUMN public.marketing_post_drafts.story_render_manifest IS 'Immutable private browser-rendered JPEG frames bound to marketing_draft_hash; automatic=false until every sticker has explicit omit consent.';
CREATE OR REPLACE FUNCTION public.marketing_story_render_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h text; p text; i integer:=0; f jsonb; automatic boolean:=true;
BEGIN
 IF NEW.story_render_manifest IS DISTINCT FROM OLD.story_render_manifest THEN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Story rendering records are server-only'; END IF;
  IF OLD.status::text IN ('publishing','published') OR OLD.publish_sent_at IS NOT NULL OR OLD.ig_container_ids<>'[]'::jsonb THEN RAISE EXCEPTION 'Publishing content is locked'; END IF;
  h:=public.marketing_draft_hash(NEW);
  IF NEW.format<>'story' OR NEW.story_render_manifest->>'content_hash' IS DISTINCT FROM h THEN RAISE EXCEPTION 'Story content changed; render again'; END IF;
  IF jsonb_typeof(NEW.story_render_manifest->'paths') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.story_render_manifest->'paths')<>jsonb_array_length(coalesce(NEW.final_story_frames,NEW.ai_story_frames,'[]'::jsonb)) OR jsonb_array_length(NEW.story_render_manifest->'paths')=0 THEN RAISE EXCEPTION 'Story frames missing'; END IF;
  FOR p IN SELECT jsonb_array_elements_text(NEW.story_render_manifest->'paths') LOOP
   i:=i+1;
   IF p<>NEW.id::text||'/story-render/'||h||'/'||i::text||'.jpg' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketing-assets' AND name=p) THEN RAISE EXCEPTION 'Story render path unavailable'; END IF;
  END LOOP;
  FOR f IN SELECT value FROM jsonb_array_elements(coalesce(NEW.final_story_frames,NEW.ai_story_frames,'[]'::jsonb)) LOOP
   IF coalesce(f->'sticker'->>'type','none')<>'none' AND coalesce(f->>'sticker_policy','')<>'omit' THEN automatic:=false; END IF;
  END LOOP;
  IF (NEW.story_render_manifest->>'automatic')::boolean IS DISTINCT FROM automatic THEN RAISE EXCEPTION 'Story sticker choice mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_story_render_guard BEFORE UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_story_render_guard();
CREATE OR REPLACE FUNCTION public.marketing_store_story_render(_id uuid,_hash text,_manifest jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR public.marketing_draft_hash(d) IS DISTINCT FROM _hash THEN RAISE EXCEPTION 'Story content changed; render again'; END IF;
 UPDATE public.marketing_post_drafts SET story_render_manifest=_manifest WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.marketing_store_story_render(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_store_story_render(uuid,text,jsonb) TO service_role;
CREATE POLICY marketing_story_render_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='marketing-assets' AND (storage.foldername(name))[2]='story-render' AND public.has_module_permission(auth.uid(),'marketing.view','all'));
