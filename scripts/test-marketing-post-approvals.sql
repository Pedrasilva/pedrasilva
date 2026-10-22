-- Disposable, fully rolled-back check of marketing post approvals, content-hash invalidation and the never_mention rule.
-- Everything is created inside this block and undone by the final RAISE; no real project or draft is touched.
-- Note: the existing readiness check already blocks approval of any draft whose project is never_mention,
-- so the approval flow runs on a describe_only project and the profile is switched to never_mention afterwards.
DO $$
DECLARE
  curator uuid := (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1);
  colleague uuid; p uuid; req uuid; d uuid; aid uuid; st text; h text; ed boolean; log text := ''; n int; dr public.marketing_post_drafts;
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
  RAISE EXCEPTION 'RESULTS:%', log;
END $$;
