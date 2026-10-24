-- All fixtures and temporary permission rows roll back together; no real project or draft is edited.
DO $$
DECLARE actor uuid; peer uuid; project uuid; request uuid; draft uuid; approval uuid; row public.marketing_post_drafts; reason text; clearance text;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO peer FROM auth.users WHERE id<>actor ORDER BY created_at LIMIT 1;
 IF actor IS NULL OR peer IS NULL THEN RAISE EXCEPTION 'Need two identities'; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(peer,'admin') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 INSERT INTO public.pm_projects(name) VALUES('QA advisory disposable') RETURNING id INTO project;
 INSERT INTO public.marketing_project_profiles(project_id,name_rule,location,sector,clearance) VALUES(project,'never_mention','Moscovo, Rússia','hospitality','unknown');
 INSERT INTO public.marketing_post_requests(period_start,period_end,idea_count,requested_by) VALUES(current_date,current_date+7,1,actor) RETURNING id INTO request;
 INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,project_id,ai_copy,ai_hashtags,rationale,readiness,bible_version,model,format) VALUES(request,gen_random_uuid(),'instagram','{}','{}',project,'Um interior calmo.','{}','QA','needs_approval',1,'test','single') RETURNING id INTO draft;
 FOREACH clearance IN ARRAY ARRAY['unknown','internal_only'] LOOP
  UPDATE public.marketing_project_profiles SET clearance=clearance::public.marketing_clearance WHERE project_id=project;
  UPDATE public.marketing_post_drafts SET status='suggested' WHERE id=draft;
  approval:=public.marketing_request_post_approval(draft,peer,NULL);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',peer,'role','authenticated')::text,true);
  PERFORM public.marketing_decide_post_approval(approval,'approved',NULL);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  SELECT * INTO row FROM public.marketing_post_drafts WHERE id=draft;
  IF row.status::text<>'approved' OR jsonb_array_length(row.warning_approval_history)=0 THEN RAISE EXCEPTION 'FAIL advisory approval %',clearance; END IF;
  IF public.marketing_publish_blocker(row) IS NOT NULL THEN RAISE EXCEPTION 'FAIL publish advisory %',clearance; END IF;
  PERFORM public.marketing_schedule_instagram(draft,now()+interval '100 years',false);
  SELECT * INTO row FROM public.marketing_post_drafts WHERE id=draft;
  IF row.status::text<>'scheduled' THEN RAISE EXCEPTION 'FAIL schedule %',clearance; END IF;
 END LOOP;
 UPDATE public.marketing_post_drafts SET status='suggested',final_copy='Um interior em Moscovo.' WHERE id=draft;
 BEGIN
  UPDATE public.marketing_post_drafts SET status='approved' WHERE id=draft;
  RAISE EXCEPTION 'FAIL name approval without confirmation';
 EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
  IF position('Confirm publication concern first' IN reason)=0 THEN RAISE EXCEPTION 'FAIL unexpected name reason %',reason; END IF;
 END;
 SELECT * INTO row FROM public.marketing_post_drafts WHERE id=draft;
 PERFORM public.marketing_confirm_draft_warning(draft,public.marketing_draft_hash(row));
 UPDATE public.marketing_post_drafts SET status='approved' WHERE id=draft;
 SELECT * INTO row FROM public.marketing_post_drafts WHERE id=draft;
 IF row.status::text<>'approved' OR (row.warning_approval_history->-1->>'named_client_confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL confirmed name audit'; END IF;
 UPDATE public.marketing_post_drafts SET final_copy='Outro interior em Moscovo.' WHERE id=draft;
 SELECT * INTO row FROM public.marketing_post_drafts WHERE id=draft;
 IF row.status::text<>'suggested' OR row.warning_confirmation_hash IS NOT NULL OR row.approved_content_hash IS NOT NULL THEN RAISE EXCEPTION 'FAIL stale content invalidation'; END IF;
 RAISE EXCEPTION 'PASS advisory unknown/internal_only request approval schedule publish eligibility, named confirmation audit, invalidation; ALL FIXTURES ROLLED BACK';
END $$;