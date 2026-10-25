-- Disposable fixtures only; deliberately raises PASS so the entire transaction rolls back.
DO $$
DECLARE actor uuid; prof public.marketing_project_profiles; cap public.marketing_captures; req uuid; draft public.marketing_post_drafts; live uuid; result record; before_projects bigint;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Missing administrator fixture actor'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 SELECT count(*) INTO before_projects FROM public.pm_projects;
 INSERT INTO public.marketing_project_profiles(internal_name,internal_client,clearance,name_rule,post_language,location,sector)
 VALUES('[TEST] Portfolio SQL disposable','Fixture Brand','unknown','never_mention','pt-PT','Lisbon','healthcare') RETURNING * INTO prof;
 IF prof.project_id IS NOT NULL OR prof.marketing_key IS NULL THEN RAISE EXCEPTION 'FAIL standalone identity'; END IF;
 IF (SELECT count(*) FROM public.pm_projects)<>before_projects THEN RAISE EXCEPTION 'FAIL operational isolation'; END IF;
 INSERT INTO public.marketing_captures(channel,profile_id,raw_text,clearance,created_by,status)
 VALUES('hub',prof.id,'[TEST] Portfolio fixture','cleared',actor,'enriched') RETURNING * INTO cap;
 IF cap.project_id IS NOT NULL OR public.marketing_capture_key(cap)<>prof.marketing_key THEN RAISE EXCEPTION 'FAIL capture identity'; END IF;
 IF public.marketing_effective_clearance(cap.id)<>'unknown' THEN RAISE EXCEPTION 'FAIL portfolio unknown clearance overrides cleared capture'; END IF;
 SELECT * INTO result FROM public.marketing_compute_draft_readiness(ARRAY[cap.id],'Fixture Brand','{}',prof.marketing_key);
 IF result.readiness<>'blocked' THEN RAISE EXCEPTION 'FAIL named portfolio must be blocked'; END IF;
 IF NOT 'Names a client that must not be named'=ANY(result.flags) THEN RAISE EXCEPTION 'FAIL protected name'; END IF;
 -- Omit the draft key to isolate the capture/profile join from the direct-profile branch.
 SELECT * INTO result FROM public.marketing_compute_draft_readiness(ARRAY[cap.id],'Fixture Brand','{}',NULL);
 IF result.readiness<>'blocked' OR NOT 'Names a client that must not be named'=ANY(result.flags) THEN RAISE EXCEPTION 'FAIL capture-only portfolio naming'; END IF;
 INSERT INTO public.marketing_post_requests(period_start,period_end,idea_count,requested_by) VALUES(current_date,current_date,1,actor) RETURNING id INTO req;
 INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,project_id,ai_copy,rationale,readiness,bible_version,model,post_language)
 VALUES(req,gen_random_uuid(),'instagram',ARRAY[cap.id],'{}',prof.marketing_key,'[TEST] Safe courtyard','[TEST]','ready',1,'fixture','pt-PT') RETURNING * INTO draft;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_capture_draft_links WHERE capture_id=cap.id AND draft_id=draft.id) THEN RAISE EXCEPTION 'FAIL capture stage links'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_draft_clearance_sources WHERE draft_id=draft.id AND kind='project' AND label=prof.internal_name AND clearance='unknown' AND warning) THEN RAISE EXCEPTION 'FAIL portfolio source label'; END IF;
 UPDATE public.marketing_project_profiles SET clearance='internal_only' WHERE id=prof.id;
 IF (SELECT readiness FROM public.marketing_post_drafts WHERE id=draft.id)<>'blocked' THEN RAISE EXCEPTION 'FAIL automatic warning refresh'; END IF;
 IF (SELECT status FROM public.marketing_post_drafts WHERE id=draft.id)<>'suggested' THEN RAISE EXCEPTION 'FAIL warning changed editorial status'; END IF;
 INSERT INTO public.pm_projects(name) VALUES('[TEST] Portfolio link disposable') RETURNING id INTO live;
 PERFORM public.marketing_link_portfolio(prof.id,live);
 IF (SELECT marketing_key FROM public.marketing_project_profiles WHERE id=prof.id)<>prof.marketing_key OR (SELECT project_id FROM public.marketing_captures WHERE id=cap.id)<>live OR (SELECT project_id FROM public.marketing_post_drafts WHERE id=draft.id)<>prof.marketing_key THEN RAISE EXCEPTION 'FAIL linkage history'; END IF;
 IF (SELECT post_language FROM public.marketing_post_drafts WHERE id=draft.id)<>'pt-PT' THEN RAISE EXCEPTION 'FAIL language history'; END IF;
 RAISE EXCEPTION 'PASS: portfolio isolation, capture identity, clearance, protected names, stage links, automatic warnings, linking history, language; ALL FIXTURES ROLLED BACK';
END $$;