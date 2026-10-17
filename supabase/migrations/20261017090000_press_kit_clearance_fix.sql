CREATE OR REPLACE FUNCTION public.marketing_compute_asset_draft_readiness(_capture_ids uuid[], _asset_ids uuid[], _project_id uuid, _copy text, _hashtags text[], OUT readiness public.marketing_draft_readiness, OUT note text, OUT flags text[])
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE res record; pid uuid;
BEGIN
  SELECT * INTO res FROM public.marketing_compute_draft_readiness(_capture_ids, _copy, _hashtags, _project_id);
  readiness := res.readiness; note := res.note; flags := coalesce(res.flags, '{}');
  FOR pid IN SELECT DISTINCT p.project_id FROM public.marketing_project_media m JOIN public.marketing_project_profiles p ON p.id=m.profile_id WHERE m.id=ANY(coalesce(_asset_ids,'{}')) LOOP
    SELECT * INTO res FROM public.marketing_compute_draft_readiness('{}', _copy, _hashtags, pid);
    IF res.readiness='blocked' OR (res.readiness='needs_approval' AND readiness='ready') THEN readiness:=res.readiness; END IF;
    IF res.note IS NOT NULL THEN note:=concat_ws('; ',note,res.note); END IF;
    flags:=flags || coalesce(res.flags,'{}');
  END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.marketing_compute_asset_draft_readiness(uuid[],uuid[],uuid,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_compute_asset_draft_readiness(uuid[],uuid[],uuid,text,text[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE res record; lib uuid;
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
  lib := public.marketing_draft_library_project(NEW.asset_ids, NEW.capture_ids, NEW.project_id);

  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags) THEN
    NEW.status := 'suggested';
    NEW.edited_after_approval := true;
    SELECT * INTO res FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids, NEW.asset_ids, NEW.project_id,
      coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags));
    NEW.readiness := res.readiness; NEW.readiness_note := res.note; NEW.safety_flags := res.flags;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'Only approved drafts can be marked as published';
    END IF;
    IF NEW.status = 'approved' THEN
      SELECT * INTO res FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids, NEW.asset_ids, NEW.project_id,
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
END $function$
;
CREATE OR REPLACE FUNCTION public.marketing_recheck_draft_readiness(_draft_id uuid)
 RETURNS marketing_draft_readiness
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT * INTO res FROM public.marketing_compute_asset_draft_readiness(d.capture_ids, d.asset_ids, d.project_id,
    coalesce(d.final_copy, d.ai_copy), coalesce(d.final_hashtags, d.ai_hashtags));
  PERFORM set_config('marketing.readiness_recheck','on',true);
  UPDATE public.marketing_post_drafts SET readiness = res.readiness, readiness_note = res.note, safety_flags = res.flags
    WHERE id = _draft_id;
  PERFORM set_config('marketing.readiness_recheck','off',true);
  RETURN res.readiness;
END $function$
;
