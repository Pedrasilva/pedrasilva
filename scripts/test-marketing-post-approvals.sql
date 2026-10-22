-- Disposable, fully rolled-back check of marketing post approvals, content-hash invalidation and the never_mention rule.
-- Everything is created inside this block and undone by the final RAISE; no real project or draft is touched.
DO $$
DECLARE
  curator uuid := (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1);
  colleague uuid; p uuid; req uuid; d uuid; aid uuid; st text; h text; log text := ''; n int;
  PROCEDURE_DUMMY int;
BEGIN
  SELECT id INTO colleague FROM auth.users WHERE id <> curator ORDER BY created_at LIMIT 1;
  INSERT INTO public.user_roles (user_id, role) VALUES (colleague, 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.pm_projects (name) VALUES ('TESTE descartável marketing') RETURNING id INTO p;
  INSERT INTO public.marketing_project_profiles (project_id, name_rule, location, sector) VALUES (p, 'never_mention', 'Moscovo, Rússia', 'hospitality');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  INSERT INTO public.marketing_post_requests (period_start, period_end, idea_count, requested_by) VALUES (current_date, current_date + 7, 1, curator) RETURNING id INTO req;
  INSERT INTO public.marketing_post_drafts (request_id, idea_id, platform, capture_ids, asset_ids, project_id, ai_copy, ai_hashtags, rationale, readiness, bible_version, model, format)
    VALUES (req, gen_random_uuid(), 'instagram', '{}', '{}', p, 'Um novo hotel em Moscovo.', '{}', 'teste', 'ready', 1, 'test', 'single') RETURNING id INTO d;

  -- 1. never_mention: request blocked while the saved text names the city
  BEGIN PERFORM public.marketing_request_post_approval(d, colleague, NULL); log := log || E'\n1 FAIL request allowed';
  EXCEPTION WHEN others THEN log := log || E'\n1 ok request blocked: ' || SQLERRM; END;
  -- 2. clean text, request approval
  UPDATE public.marketing_post_drafts SET final_copy = 'Um novo projeto de interiores.' WHERE id = d;
  aid := public.marketing_request_post_approval(d, colleague, 'Ver por favor');
  SELECT status INTO st FROM public.marketing_post_drafts WHERE id = d;
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = colleague AND entity_id = aid;
  log := log || E'\n2 status=' || st || ' bell=' || n;
  -- 3. direct pending_approval set refused
  BEGIN UPDATE public.marketing_post_drafts SET status = 'suggested' WHERE id = d; UPDATE public.marketing_post_drafts SET status = 'pending_approval' WHERE id = d; log := log || E'\n3 FAIL';
  EXCEPTION WHEN others THEN log := log || E'\n3 ok direct pending refused: ' || SQLERRM; END;
  -- 4. colleague approves (request was voided by step 3's move to suggested → ask again)
  aid := public.marketing_request_post_approval(d, colleague, NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', colleague, 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.marketing_decide_post_approval(aid, 'approved', 'Ok');
    SELECT status, approved_content_hash INTO st, h FROM public.marketing_post_drafts WHERE id = d;
    SELECT count(*) INTO n FROM public.notifications WHERE user_id = curator AND entity_id = aid;
    log := log || E'\n4 status=' || st || ' hash=' || (h IS NOT NULL) || ' bell=' || n;
  EXCEPTION WHEN others THEN log := log || E'\n4 approve failed: ' || SQLERRM; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', curator, 'role', 'authenticated')::text, true);
  -- 5. schedule with valid approval
  BEGIN UPDATE public.marketing_post_drafts SET status = 'scheduled', scheduled_at = now() + interval '3 days' WHERE id = d;
    SELECT status INTO st FROM public.marketing_post_drafts WHERE id = d; log := log || E'\n5 status=' || st;
  EXCEPTION WHEN others THEN log := log || E'\n5 schedule failed: ' || SQLERRM; END;
  -- 6. location tag on a never_mention project is refused while scheduled
  BEGIN UPDATE public.marketing_post_drafts SET location_tag = 'Moscovo' WHERE id = d; log := log || E'\n6 FAIL';
  EXCEPTION WHEN others THEN log := log || E'\n6 ok location tag refused: ' || SQLERRM; END;
  -- 7. editing the caption voids the approval and returns to suggested
  UPDATE public.marketing_post_drafts SET final_copy = 'Um novo projeto de interiores, revisto.' WHERE id = d;
  SELECT status, approved_content_hash, edited_after_approval::text INTO st, h, log FROM (SELECT status::text, approved_content_hash, edited_after_approval, log AS l FROM public.marketing_post_drafts WHERE id = d) x;
  SELECT count(*) INTO n FROM public.marketing_post_approvals WHERE draft_id = d AND voided_at IS NULL AND decision = 'approved';
  RAISE EXCEPTION 'RESULTS:% | 7 status=% hash_cleared=% edited_after_approval=% valid_approvals=%', '', st, (h IS NULL), log, n;
END $$;
