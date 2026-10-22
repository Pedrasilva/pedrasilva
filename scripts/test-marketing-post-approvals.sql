-- Disposable, fully rolled-back check of marketing post approvals, content-hash invalidation and the never_mention rule.
-- Everything is created inside this block and undone by the final RAISE; no real project or draft is touched.
-- The anonymous-project cases below exercise actual status writes and RPCs, not just the helper.
DO $$
DECLARE
  curator uuid := (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1);
  colleague uuid; p uuid; req uuid; d uuid; aid uuid; st text; h text; ed boolean; log text := ''; n int; dr public.marketing_post_drafts;
  anonymous_project uuid; anonymous_draft uuid; sample record; reason text; checks int := 0;
BEGIN
  SELECT id INTO colleague FROM auth.users WHERE id <> curator ORDER BY created_at LIMIT 1;
  INSERT INTO public.user_roles (user_id, role) VALUES (colleague, 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.pm_projects (name) VALUES ('TESTE descartável marketing') RETURNING id INTO p;
  INSERT INTO public.marketing_project_profiles (project_id, name_rule, location, sector, clearance) VALUES (p, 'describe_only', 'Moscovo, Rússia', 'hospitality', 'cleared');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  INSERT INTO public.marketing_post_requests (period_start, period_end, idea_count, requested_by) VALUES (current_date, current_date + 7, 1, curator) RETURNING id INTO req;
  INSERT INTO public.marketing_post_drafts (request_id, idea_id, platform, capture_ids, asset_ids, project_id, ai_copy, ai_hashtags, rationale, readiness, bible_version, model, format)
    VALUES (req, gen_random_uuid(), 'instagram', '{}', '{}', p, 'Um novo projeto de interiores.', '{}', 'teste', 'ready', 1, 'test', 'single') RETURNING id INTO d;
  -- A. request → bell
  aid := public.marketing_request_post_approval(d, colleague, 'Ver por favor');
  SELECT status INTO st FROM public.marketing_post_drafts WHERE id = d;
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = colleague AND entity_id = aid;
  log := log || E'\nA status=' || st || ' approver_bell=' || n;
  -- B. pending_approval cannot be set by hand
  BEGIN UPDATE public.marketing_post_drafts SET status = 'suggested' WHERE id = d; UPDATE public.marketing_post_drafts SET status = 'pending_approval' WHERE id = d; log := log || E'\nB FAIL';
  EXCEPTION WHEN others THEN log := log || E'\nB ok: ' || SQLERRM; END;
  -- C. requester cannot decide; colleague requests changes (comment required) then approves a new request
  aid := public.marketing_request_post_approval(d, colleague, NULL);
  BEGIN PERFORM public.marketing_decide_post_approval(aid, 'approved', NULL); log := log || E'\nC FAIL requester decided';
  EXCEPTION WHEN others THEN log := log || E'\nC ok requester refused: ' || SQLERRM; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', colleague, 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.marketing_decide_post_approval(aid, 'changes_requested', ''); log := log || E'\nC FAIL no comment';
  EXCEPTION WHEN others THEN log := log || E'\nC ok comment required: ' || SQLERRM; END;
  PERFORM public.marketing_decide_post_approval(aid, 'changes_requested', 'Encurtar');
  SELECT status INTO st FROM public.marketing_post_drafts WHERE id = d;
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = curator AND entity_id = aid;
  log := log || E'\nC changes → status=' || st || ' requester_bell=' || n;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  aid := public.marketing_request_post_approval(d, colleague, NULL);
  -- D. content edited while pending → request void, decision refused
  UPDATE public.marketing_post_drafts SET final_copy = 'Texto alterado durante o pedido.' WHERE id = d;
  SELECT status INTO st FROM public.marketing_post_drafts WHERE id = d;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', colleague, 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.marketing_decide_post_approval(aid, 'approved', NULL); log := log || E'\nD FAIL';
  EXCEPTION WHEN others THEN log := log || E'\nD ok status=' || st || ', stale decision refused: ' || SQLERRM; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  aid := public.marketing_request_post_approval(d, colleague, NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', colleague, 'role', 'authenticated')::text, true);
  PERFORM public.marketing_decide_post_approval(aid, 'approved', 'Ok');
  SELECT status, approved_content_hash INTO st, h FROM public.marketing_post_drafts WHERE id = d;
  log := log || E'\nE approved status=' || st || ' hash_stored=' || (h IS NOT NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  -- F. scheduling needs a time, then works with the valid approval
  BEGIN UPDATE public.marketing_post_drafts SET status = 'scheduled' WHERE id = d; log := log || E'\nF FAIL';
  EXCEPTION WHEN others THEN log := log || E'\nF ok no time: ' || SQLERRM; END;
  UPDATE public.marketing_post_drafts SET status = 'scheduled', scheduled_at = now() + interval '3 days' WHERE id = d;
  SELECT status INTO st FROM public.marketing_post_drafts WHERE id = d; log := log || E'\nF scheduled status=' || st;
  -- G. never_mention switched on: location tag, city in hashtags and sector word are refused for scheduled
  UPDATE public.marketing_project_profiles SET name_rule = 'never_mention' WHERE project_id = p;
  BEGIN UPDATE public.marketing_post_drafts SET location_tag = 'Moscovo' WHERE id = d; log := log || E'\nG FAIL tag';
  EXCEPTION WHEN others THEN log := log || E'\nG ok tag: ' || SQLERRM; END;
  SELECT * INTO dr FROM public.marketing_post_drafts WHERE id = d;
  dr.final_hashtags := ARRAY['russia']; log := log || E'\nG hashtag: ' || coalesce(public.marketing_draft_name_rule_violation(dr), 'FAIL none');
  dr.final_hashtags := '{}'; dr.final_copy := 'O nosso novo Hotel.'; log := log || E'\nG sector: ' || coalesce(public.marketing_draft_name_rule_violation(dr), 'FAIL none');
  dr.final_copy := 'Um interior calmo.'; log := log || E'\nG clean: ' || coalesce(public.marketing_draft_name_rule_violation(dr), 'none (ok)');
  UPDATE public.marketing_project_profiles SET name_rule = 'describe_only' WHERE project_id = p;
  -- H. editing caption after scheduling voids approval, back to suggested, cannot reschedule
  UPDATE public.marketing_post_drafts SET final_copy = 'Texto revisto depois de agendar.' WHERE id = d;
  SELECT status::text, approved_content_hash, edited_after_approval INTO st, h, ed FROM public.marketing_post_drafts WHERE id = d;
  SELECT count(*) INTO n FROM public.marketing_post_approvals WHERE draft_id = d AND voided_at IS NULL AND decision = 'approved';
  log := log || E'\nH status=' || st || ' hash_cleared=' || (h IS NULL) || ' edited_after_approval=' || ed || ' valid_approvals=' || n;
  BEGIN UPDATE public.marketing_post_drafts SET status = 'scheduled' WHERE id = d; log := log || E'\nH FAIL';
  EXCEPTION WHEN others THEN log := log || E'\nH ok reschedule refused: ' || SQLERRM; END;
  -- I. direct curator approval records an approval row; a media change voids it
  UPDATE public.marketing_post_drafts SET status = 'approved' WHERE id = d;
  SELECT count(*) INTO n FROM public.marketing_post_approvals WHERE draft_id = d AND voided_at IS NULL AND decision = 'approved';
  UPDATE public.marketing_post_drafts SET asset_ids = ARRAY[gen_random_uuid()] WHERE id = d;
  SELECT status::text INTO st FROM public.marketing_post_drafts WHERE id = d;
  log := log || E'\nI direct approval rows=' || n || ', status after media change=' || st;
  -- J. A separate disposable never_mention project: anonymity is not internal_only.
  INSERT INTO public.pm_projects (name) VALUES ('TEST anonymous marketing approvals') RETURNING id INTO anonymous_project;
  INSERT INTO public.marketing_project_profiles (project_id, name_rule, location, sector, clearance)
    VALUES (anonymous_project, 'never_mention', 'Moscovo, Rússia', 'hospitality', 'cleared');
  INSERT INTO public.marketing_post_drafts (request_id, idea_id, platform, capture_ids, asset_ids, project_id, ai_copy, ai_hashtags, rationale, readiness, bible_version, model, format)
    VALUES (req, gen_random_uuid(), 'instagram', '{}', '{}', anonymous_project, 'Um interior calmo.', '{}', 'isolated anonymity check', 'blocked', 1, 'test', 'single') RETURNING id INTO anonymous_draft;
  IF public.marketing_recheck_draft_readiness(anonymous_draft) <> 'ready' THEN RAISE EXCEPTION 'FAIL clean anonymous readiness'; END IF;
  aid := public.marketing_request_post_approval(anonymous_draft, colleague, NULL);
  SELECT status::text INTO st FROM public.marketing_post_drafts WHERE id = anonymous_draft;
  IF st <> 'pending_approval' THEN RAISE EXCEPTION 'FAIL clean anonymous pending approval'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', colleague, 'role', 'authenticated')::text, true);
  PERFORM public.marketing_decide_post_approval(aid, 'approved', NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  UPDATE public.marketing_post_drafts SET status = 'scheduled', scheduled_at = now() + interval '3 days' WHERE id = anonymous_draft;
  SELECT status::text INTO st FROM public.marketing_post_drafts WHERE id = anonymous_draft;
  IF st <> 'scheduled' THEN RAISE EXCEPTION 'FAIL clean anonymous scheduled'; END IF;
  log := log || E'\nJ clean never_mention: ready → pending_approval → approved → scheduled (ok)';

  -- K. Every unsafe field must give its specific reason at all three gates.
  FOR sample IN SELECT * FROM (VALUES
    ('city', 'Um interior em Moscovo.', '{}'::text[], NULL::text, NULL::jsonb, 'moscovo'),
    ('sector', 'Um novo Hotel.', '{}'::text[], NULL::text, NULL::jsonb, 'hotel'),
    ('location_tag', 'Um interior calmo.', '{}'::text[], 'Moscovo', NULL::jsonb, 'etiqueta de localização'),
    ('hashtag', 'Um interior calmo.', ARRAY['russia'], NULL::text, NULL::jsonb, 'russia'),
    ('story_frame', 'Um interior calmo.', '{}'::text[], NULL::text, '[{"text":"Um interior","line":"Moscovo","sticker":{"type":"none","text":""}}]'::jsonb, 'moscovo')
  ) AS cases(label, caption, tags, location_tag, frames, expected_reason) LOOP
    UPDATE public.marketing_post_drafts SET status = 'suggested', final_copy = sample.caption,
      final_hashtags = sample.tags, location_tag = sample.location_tag, final_story_frames = sample.frames WHERE id = anonymous_draft;
    PERFORM public.marketing_recheck_draft_readiness(anonymous_draft);
    BEGIN
      PERFORM public.marketing_request_post_approval(anonymous_draft, colleague, NULL);
      RAISE EXCEPTION 'FAIL unsafe pending approval: %', sample.label;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS reason = MESSAGE_TEXT;
      IF position(sample.expected_reason IN lower(reason)) = 0 THEN RAISE EXCEPTION 'FAIL pending % reason: %', sample.label, reason; END IF;
      checks := checks + 1;
    END;
    BEGIN
      UPDATE public.marketing_post_drafts SET status = 'approved' WHERE id = anonymous_draft;
      RAISE EXCEPTION 'FAIL unsafe approval: %', sample.label;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS reason = MESSAGE_TEXT;
      IF position(sample.expected_reason IN lower(reason)) = 0 THEN RAISE EXCEPTION 'FAIL approved % reason: %', sample.label, reason; END IF;
      checks := checks + 1;
    END;
    UPDATE public.marketing_post_drafts SET final_copy = 'Um interior calmo.', final_hashtags = '{}', location_tag = NULL, final_story_frames = NULL WHERE id = anonymous_draft;
    UPDATE public.marketing_post_drafts SET status = 'approved' WHERE id = anonymous_draft;
    BEGIN
      UPDATE public.marketing_post_drafts SET status = 'scheduled', scheduled_at = now() + interval '3 days',
        final_copy = sample.caption, final_hashtags = sample.tags, location_tag = sample.location_tag, final_story_frames = sample.frames WHERE id = anonymous_draft;
      RAISE EXCEPTION 'FAIL unsafe scheduling: %', sample.label;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS reason = MESSAGE_TEXT;
      IF position(sample.expected_reason IN lower(reason)) = 0 THEN RAISE EXCEPTION 'FAIL scheduled % reason: %', sample.label, reason; END IF;
      checks := checks + 1;
    END;
    log := log || format(E'\nK %s rejected at pending/approved/scheduled with reason «%s» (ok)', sample.label, sample.expected_reason);
  END LOOP;
  IF checks <> 15 THEN RAISE EXCEPTION 'FAIL expected 15 unsafe-content rejections, got %', checks; END IF;

  -- L. Independent internal_only clearance still blocks safe anonymous content.
  UPDATE public.marketing_project_profiles SET clearance = 'internal_only' WHERE project_id = anonymous_project;
  IF public.marketing_recheck_draft_readiness(anonymous_draft) <> 'blocked' THEN RAISE EXCEPTION 'FAIL internal_only readiness'; END IF;
  BEGIN
    UPDATE public.marketing_post_drafts SET status = 'scheduled', scheduled_at = now() + interval '3 days' WHERE id = anonymous_draft;
    RAISE EXCEPTION 'FAIL internal_only scheduling';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS reason = MESSAGE_TEXT;
    IF position('internal-only' IN reason) = 0 THEN RAISE EXCEPTION 'FAIL internal_only reason: %', reason; END IF;
  END;
  UPDATE public.marketing_post_drafts SET status = 'suggested' WHERE id = anonymous_draft;
  BEGIN
    UPDATE public.marketing_post_drafts SET status = 'approved' WHERE id = anonymous_draft;
    RAISE EXCEPTION 'FAIL internal_only approval';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS reason = MESSAGE_TEXT;
    IF position('internal-only' IN reason) = 0 THEN RAISE EXCEPTION 'FAIL internal_only approval reason: %', reason; END IF;
  END;
  BEGIN
    PERFORM public.marketing_request_post_approval(anonymous_draft, colleague, NULL);
    RAISE EXCEPTION 'FAIL internal_only pending';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS reason = MESSAGE_TEXT;
    IF position('internal-only' IN reason) = 0 THEN RAISE EXCEPTION 'FAIL internal_only pending reason: %', reason; END IF;
  END;
  log := log || E'\nL separate internal_only blocks readiness/pending/approved/scheduled (ok)';
  IF position('FAIL' IN log) > 0 THEN RAISE EXCEPTION 'REGRESSION FAILED:%', log; END IF;
  -- Intentional exception rolls back fixtures, temporary roles and all notifications.
  RAISE EXCEPTION 'RESULTS (ALL CHECKS PASSED; ROLLBACK):%', log;
END $$;
