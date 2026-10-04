-- 1. Library-only posts: approval uses the same library-aware readiness as recheck
CREATE OR REPLACE FUNCTION public.marketing_draft_library_project(_asset_ids uuid[], _capture_ids uuid[], _project_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT pr.project_id FROM public.marketing_project_media m
       JOIN public.marketing_project_profiles pr ON pr.id = m.profile_id
      WHERE m.id = ANY(coalesce(_asset_ids,'{}')) LIMIT 1),
    CASE WHEN coalesce(array_length(_capture_ids,1),0) = 0 THEN _project_id END)
$$;
REVOKE ALL ON FUNCTION public.marketing_draft_library_project(uuid[], uuid[], uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    SELECT * INTO res FROM public.marketing_compute_draft_readiness(NEW.capture_ids,
      coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags), lib);
    NEW.readiness := res.readiness; NEW.readiness_note := res.note; NEW.safety_flags := res.flags;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'Only approved drafts can be marked as published';
    END IF;
    IF NEW.status = 'approved' THEN
      SELECT * INTO res FROM public.marketing_compute_draft_readiness(NEW.capture_ids,
        coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags), lib);
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

-- 2. Cost rates: fallback to the person's current calculated rate, never empty / never 0
ALTER TABLE public.pm_time_entries DROP CONSTRAINT IF EXISTS pm_time_entries_cost_rate_source_check;
ALTER TABLE public.pm_time_entries ADD CONSTRAINT pm_time_entries_cost_rate_source_check
  CHECK (cost_rate_source = ANY (ARRAY['live','backfill','recalc','fallback']));

CREATE OR REPLACE FUNCTION public.pm_cost_rate_fallback(_resource_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.cost_rate FROM public.pm_cost_rate_periods p
      WHERE p.resource_id = _resource_id AND p.cost_rate > 0
        AND p.valid_from <= current_date AND (p.valid_to IS NULL OR current_date < p.valid_to)
      ORDER BY p.valid_from DESC LIMIT 1),
    (SELECT p.cost_rate FROM public.pm_cost_rate_periods p
      WHERE p.resource_id = _resource_id AND p.cost_rate > 0
      ORDER BY p.valid_from DESC LIMIT 1),
    (SELECT NULLIF(r.cost_rate, 0) FROM public.pm_resources r WHERE r.id = _resource_id))
$$;
REVOKE ALL ON FUNCTION public.pm_cost_rate_fallback(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pm_time_entry_cost_snapshot()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _res uuid; _rate numeric;
BEGIN
  IF current_setting('psa.cost_rate_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.entry_date = OLD.entry_date AND NEW.user_id = OLD.user_id THEN
    NEW.cost_rate_snapshot := OLD.cost_rate_snapshot;
    NEW.cost_rate_source := OLD.cost_rate_source;
    RETURN NEW;
  END IF;
  IF NEW.entry_type::text = 'non_working' OR NEW.leave_type IS NOT NULL THEN
    NEW.cost_rate_snapshot := NULL;
    NEW.cost_rate_source := NULL;
    RETURN NEW;
  END IF;
  _res := public.pm_entry_resource(NEW.user_id, NEW.task_id);
  _rate := CASE WHEN _res IS NULL THEN NULL ELSE NULLIF(public.pm_cost_rate_at(_res, NEW.entry_date), 0) END;
  IF _rate IS NOT NULL THEN
    NEW.cost_rate_snapshot := _rate; NEW.cost_rate_source := 'live';
  ELSE
    _rate := CASE WHEN _res IS NULL THEN NULL ELSE public.pm_cost_rate_fallback(_res) END;
    NEW.cost_rate_snapshot := _rate;
    NEW.cost_rate_source := CASE WHEN _rate IS NULL THEN NULL ELSE 'fallback' END;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.pm_recalc_cost_snapshots(_from date, _resource_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can recalculate costs';
  END IF;
  PERFORM set_config('psa.cost_rate_write', 'on', true);
  WITH base AS (
    SELECT e.id, public.pm_entry_resource(e.user_id, e.task_id) AS res, e.entry_date
      FROM public.pm_time_entries e
     WHERE e.entry_date >= _from AND e.entry_type::text <> 'non_working' AND e.leave_type IS NULL
  ), calc AS (
    SELECT b.id, b.res, x.rate, CASE WHEN x.exact IS NOT NULL THEN 'recalc' ELSE 'fallback' END AS src
      FROM base b
      CROSS JOIN LATERAL (SELECT NULLIF(public.pm_cost_rate_at(b.res, b.entry_date), 0) AS exact) y
      CROSS JOIN LATERAL (SELECT y.exact, COALESCE(y.exact, public.pm_cost_rate_fallback(b.res)) AS rate) x
  )
  UPDATE public.pm_time_entries e
     SET cost_rate_snapshot = c.rate, cost_rate_source = c.src
    FROM calc c
   WHERE e.id = c.id AND c.rate IS NOT NULL
     AND (_resource_id IS NULL OR c.res = _resource_id)
     AND (e.cost_rate_snapshot IS DISTINCT FROM c.rate OR e.cost_rate_source IS DISTINCT FROM c.src);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('psa.cost_rate_write', 'off', true);
  INSERT INTO public.pm_cost_rate_recalc_log(run_by, kind, from_date, to_date, resource_id, entries_changed)
  VALUES (auth.uid(), 'recalculate', _from, NULL, _resource_id, _n);
  RETURN _n;
END $function$;

-- 3. Capture delete: all database rows in one transaction (files removed afterwards by the server)
CREATE OR REPLACE FUNCTION public.marketing_delete_capture_rows(_capture_id uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.marketing_captures; nudge_ids uuid[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO c FROM public.marketing_captures WHERE id = _capture_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capture not found'; END IF;
  SELECT coalesce(array_agg(id), '{}') INTO nudge_ids FROM public.marketing_nudges WHERE capture_id = _capture_id;
  IF c.source_message_id IS NOT NULL THEN
    INSERT INTO public.marketing_email_ignored(message_id, capture_id, from_address, reason)
    VALUES (c.source_message_id, NULL, c.sender_email, 'deleted_capture');
  END IF;
  DELETE FROM public.marketing_project_story_suggestions WHERE capture_id = _capture_id AND status <> 'accepted';
  DELETE FROM public.notifications WHERE entity_type = 'marketing_nudge' AND entity_id = ANY(nudge_ids);
  DELETE FROM public.marketing_captures WHERE id = _capture_id;
  RETURN nudge_ids;
END $$;
REVOKE ALL ON FUNCTION public.marketing_delete_capture_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_delete_capture_rows(uuid) TO service_role;