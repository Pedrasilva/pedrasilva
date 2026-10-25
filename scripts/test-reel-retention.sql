-- Run as a privileged transaction through the database tool. All fixture rows and claims roll back.
DO $$
DECLARE actor uuid; project uuid; profile uuid; req uuid; upload uuid:=gen_random_uuid(); draft uuid; c uuid:=gen_random_uuid(); before_row jsonb; after_row jsonb; s text; blocked boolean; n integer;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Need an existing test-capable identity'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','service_role')::text,true);
 INSERT INTO public.pm_projects(name) VALUES('PSA QA disposable reel retention rollback') RETURNING id INTO project;
 INSERT INTO public.marketing_project_profiles(project_id) VALUES(project) RETURNING id INTO profile;
 INSERT INTO public.marketing_reel_uploads(id,created_by,profile_id,video_path,cover_path,file_name,mime_type)
 VALUES(upload,actor,profile,'reels/'||upload||'/video.mp4','reels/'||upload||'/cover.jpg','PSA-QA-retention.mp4','video/mp4');
 INSERT INTO public.marketing_post_requests(period_start,period_end,idea_count,requested_by) VALUES(current_date,current_date,1,actor) RETURNING id INTO req;
 INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,ai_copy,ai_hashtags,rationale,readiness,bible_version,model,format,status,ig_media_id,published_at,ig_published_at,reel_cover_path,project_id)
 VALUES(req,gen_random_uuid(),'instagram','{}',ARRAY[upload],'PSA QA disposable reel retention','{PSAQA}','Fixture','needs_approval',1,'test','reel','published','fixture-only-not-live',current_date-31,now()-interval '31 days','reels/'||upload||'/cover.jpg',project) RETURNING id INTO draft;
 IF NOT public.marketing_reel_purge_eligible(upload) THEN RAISE EXCEPTION 'FAIL published reel 31 days'; END IF;
 UPDATE public.marketing_post_drafts SET published_at=current_date-29,ig_published_at=now()-interval '29 days' WHERE id=draft;
 IF public.marketing_reel_purge_eligible(upload) THEN RAISE EXCEPTION 'FAIL younger than 30 days'; END IF;
 UPDATE public.marketing_post_drafts SET published_at=current_date-30,ig_published_at=now()-interval '30 days' WHERE id=draft;
 IF NOT public.marketing_reel_purge_eligible(upload) THEN RAISE EXCEPTION 'FAIL exact 30 days'; END IF;
 UPDATE public.marketing_post_drafts SET published_at=NULL WHERE id=draft;
 IF public.marketing_reel_purge_eligible(upload) THEN RAISE EXCEPTION 'FAIL NULL publication date'; END IF;
 UPDATE public.marketing_post_drafts SET published_at=current_date-31 WHERE id=draft;
 UPDATE public.marketing_post_drafts SET ig_media_id=NULL WHERE id=draft;
 IF public.marketing_reel_purge_eligible(upload) THEN RAISE EXCEPTION 'FAIL missing Instagram ID'; END IF;
 UPDATE public.marketing_post_drafts SET ig_media_id='fixture-only-not-live',publish_error_code='unknown' WHERE id=draft;
 IF public.marketing_reel_purge_eligible(upload) THEN RAISE EXCEPTION 'FAIL uncertain outcome'; END IF;
 UPDATE public.marketing_post_drafts SET publish_error_code=NULL,publish_lock_id=gen_random_uuid() WHERE id=draft;
 IF public.marketing_reel_purge_eligible(upload) THEN RAISE EXCEPTION 'FAIL publishing lock'; END IF;
 UPDATE public.marketing_post_drafts SET publish_lock_id=NULL WHERE id=draft;
 SELECT to_jsonb(d) INTO before_row FROM public.marketing_post_drafts d WHERE id=draft;
 PERFORM set_config('marketing.reel_purge','on',true);
 UPDATE public.marketing_reel_uploads SET video_purge_claim=c,video_purge_bytes=12345 WHERE id=upload;
 blocked:=false;
 BEGIN
  INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,ai_copy,ai_hashtags,rationale,readiness,bible_version,model,format)
  VALUES(req,gen_random_uuid(),'instagram','{}',ARRAY[upload],'PSA QA reuse blocked','{}','Fixture','needs_approval',1,'test','reel');
 EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE '%new upload%' THEN RAISE; END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL reuse without new upload'; END IF;
 IF NOT public.marketing_complete_reel_purge(upload,c) THEN RAISE EXCEPTION 'FAIL completion'; END IF;
 IF NOT public.marketing_complete_reel_purge(upload,c) THEN RAISE EXCEPTION 'FAIL idempotent completion'; END IF;
 SELECT to_jsonb(d) INTO after_row FROM public.marketing_post_drafts d WHERE id=draft;
 IF after_row-'video_purged_at'-'video_purged_bytes' IS DISTINCT FROM before_row-'video_purged_at'-'video_purged_bytes' THEN RAISE EXCEPTION 'FAIL other draft evidence changed'; END IF;
 IF (after_row->>'video_purged_bytes')::bigint<>12345 OR after_row->>'video_purged_at' IS NULL THEN RAISE EXCEPTION 'FAIL purge metadata'; END IF;
 SELECT count(*) INTO n FROM public.marketing_publish_log WHERE draft_id=draft AND step='video_purged';
 IF n<>1 THEN RAISE EXCEPTION 'FAIL audit/idempotence'; END IF;
 IF has_function_privilege('authenticated','public.marketing_claim_reel_cleanup()','EXECUTE') OR has_function_privilege('anon','public.marketing_complete_reel_purge(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'FAIL service-only grants'; END IF;
 RAISE EXCEPTION 'PASS reel retention 30-day/NULL/outcome/lock/reuse/metadata/evidence/idempotence/service grants; ALL FIXTURES ROLLED BACK';
END $$;