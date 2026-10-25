-- Disposable fixtures only; the final exception rolls back every test row.
DO $$
DECLARE actor uuid; peer uuid; req uuid; draft uuid; a uuid; row public.marketing_post_drafts; why text;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO peer FROM auth.users WHERE id<>actor ORDER BY created_at LIMIT 1;
 INSERT INTO public.user_roles(user_id,role) VALUES(peer,'admin') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','service_role')::text,true);
 INSERT INTO public.marketing_post_requests(period_start,period_end,idea_count,requested_by,brief) VALUES(current_date,current_date+7,1,actor,'QA reapproval rollback fixture') RETURNING id INTO req;
 INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,ai_copy,ai_hashtags,rationale,readiness,bible_version,model,format)
 VALUES(req,gen_random_uuid(),'instagram','{}','{}','QA reapproval rollback fixture','{}','QA','ready',1,'fixture','single') RETURNING id INTO draft;
 UPDATE public.marketing_post_drafts SET status='approved' WHERE id=draft;
 UPDATE public.marketing_post_drafts SET status='failed',publish_error_code='fixture',publish_error_message='Prior failure',publish_attempts=1 WHERE id=draft;
 UPDATE public.marketing_post_drafts SET final_copy='QA changed content' WHERE id=draft;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 a:=public.marketing_request_post_reapproval(draft,peer,'Fixture reapproval');
 SELECT * INTO row FROM public.marketing_post_drafts WHERE id=draft;
 IF row.status::text<>'pending_approval' OR row.publish_error_message<>'Prior failure' THEN RAISE EXCEPTION 'FAIL request must preserve failure until approval'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',peer,'role','authenticated')::text,true);
 PERFORM public.marketing_decide_post_approval(a,'approved',NULL);
 SELECT * INTO row FROM public.marketing_post_drafts WHERE id=draft;
 IF row.status::text<>'approved' OR row.approved_content_hash IS DISTINCT FROM public.marketing_draft_hash(row) OR row.publish_error_message IS NOT NULL OR row.publish_error_code IS NOT NULL THEN RAISE EXCEPTION 'FAIL current approval/error'; END IF;
 IF row.publish_attempts<>1 OR row.publish_sent_at IS NOT NULL OR row.publish_lock_id IS NOT NULL THEN RAISE EXCEPTION 'FAIL evidence changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_publish_log WHERE draft_id=draft AND meta_error_message='Prior failure' AND NOT success) THEN RAISE EXCEPTION 'FAIL lost failure history'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','service_role')::text,true);
 UPDATE public.marketing_post_drafts SET status='failed',publish_sent_at=now() WHERE id=draft;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 BEGIN
  PERFORM public.marketing_prepare_reapproval(draft);
  RAISE EXCEPTION 'FAIL sent evidence accepted';
 EXCEPTION WHEN others THEN GET STACKED DIAGNOSTICS why=MESSAGE_TEXT;
  IF why<>'Publishing evidence is locked' THEN RAISE EXCEPTION 'FAIL unexpected lock error %',why; END IF;
 END;
 RAISE EXCEPTION 'PASS reapproval request/decision/hash/error/history/counters/sent lock; all fixtures rolled back';
END $$;