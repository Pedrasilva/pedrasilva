CREATE OR REPLACE FUNCTION public.marketing_compute_draft_readiness(
  _capture_ids uuid[], _copy text, _hashtags text[],
  OUT readiness public.marketing_draft_readiness, OUT note text, OUT flags text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hay text := lower(coalesce(_copy,'') || ' ' || coalesce(array_to_string(_hashtags,' '),''));
  r record; named boolean := false; internal boolean := false; pending text[] := '{}';
  eff public.marketing_clearance; rk int;
BEGIN
  FOR r IN
    SELECT c.id, c.clearance AS own, c.ai_flags, coalesce(left(c.ai_summary,40), left(c.raw_text,40), c.id::text) AS label,
           p.clearance AS proj, p.name_rule, pr.name AS pname, pr.client AS pclient
    FROM public.marketing_captures c
    LEFT JOIN public.marketing_project_profiles p ON p.project_id = c.project_id
    LEFT JOIN public.pm_projects pr ON pr.id = c.project_id
    WHERE c.id = ANY(_capture_ids)
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
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_compute_draft_readiness(uuid[], text, text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.marketing_recheck_draft_readiness(_draft_id uuid)
RETURNS public.marketing_draft_readiness LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.marketing_post_drafts; res record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN
    RAISE EXCEPTION 'Not allowed to recheck drafts';
  END IF;
  SELECT * INTO d FROM public.marketing_post_drafts WHERE id = _draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  SELECT * INTO res FROM public.marketing_compute_draft_readiness(d.capture_ids,
    coalesce(d.final_copy, d.ai_copy), coalesce(d.final_hashtags, d.ai_hashtags));
  PERFORM set_config('marketing.readiness_recheck','on',true);
  UPDATE public.marketing_post_drafts SET readiness = res.readiness, readiness_note = res.note, safety_flags = res.flags
    WHERE id = _draft_id;
  PERFORM set_config('marketing.readiness_recheck','off',true);
  RETURN res.readiness;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_recheck_draft_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_recheck_draft_readiness(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE res record;
BEGIN
  IF NEW.ai_copy IS DISTINCT FROM OLD.ai_copy OR NEW.ai_hashtags IS DISTINCT FROM OLD.ai_hashtags
     OR NEW.capture_ids IS DISTINCT FROM OLD.capture_ids OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.idea_id IS DISTINCT FROM OLD.idea_id OR NEW.platform IS DISTINCT FROM OLD.platform
     OR NEW.bible_version IS DISTINCT FROM OLD.bible_version OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI original fields of a post draft cannot be changed';
  END IF;
  IF (NEW.readiness IS DISTINCT FROM OLD.readiness OR NEW.readiness_note IS DISTINCT FROM OLD.readiness_note
      OR NEW.safety_flags IS DISTINCT FROM OLD.safety_flags)
     AND coalesce(current_setting('marketing.readiness_recheck', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Readiness can only be set by the system recheck';
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
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END $$;