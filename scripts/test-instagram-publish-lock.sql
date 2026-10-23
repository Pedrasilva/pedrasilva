-- No Graph calls. Disposable rows and temporary claims rolled back by the final exception.
DO $$
DECLARE uid uuid; p uuid; req uuid; d uuid; x public.marketing_post_drafts; old_lock uuid; count_claim int; checks int:=0;
BEGIN
 SELECT user_id INTO uid FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 IF uid IS NULL THEN RAISE EXCEPTION 'FAIL: existing admin required'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
 INSERT INTO public.pm_projects(name) VALUES('TEST disposable Instagram lock') RETURNING id INTO p;
 INSERT INTO public.marketing_project_profiles(project_id,name_rule,clearance,location,sector) VALUES(p,'never_mention','cleared','Moscovo','hospitality');
 INSERT INTO public.marketing_post_requests(period_start,period_end,idea_count,requested_by) VALUES(current_date,current_date+7,1,uid) RETURNING id INTO req;
 INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,project_id,ai_copy,ai_hashtags,rationale,readiness,bible_version,model,format) VALUES(req,gen_random_uuid(),'instagram','{}','{}',p,'Um interior calmo.','{}','test','ready',1,'test','single') RETURNING id INTO d;
 UPDATE public.marketing_post_drafts SET status='approved' WHERE id=d;
 PERFORM public.marketing_schedule_instagram(d,now()-interval '1 minute');
 PERFORM set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 SELECT * INTO x FROM public.marketing_claim_publish(d);
 IF x.status::text<>'publishing' OR x.publish_lock_id IS NULL OR x.publish_attempts<>1 THEN RAISE EXCEPTION 'FAIL claim'; END IF;checks:=checks+1;old_lock:=x.publish_lock_id;
 SELECT count(*) INTO count_claim FROM public.marketing_claim_publish(d);IF count_claim<>0 THEN RAISE EXCEPTION 'FAIL double claim'; END IF;checks:=checks+1;
 IF public.marketing_publish_checkpoint(d,gen_random_uuid(),'{}',true) THEN RAISE EXCEPTION 'FAIL wrong lock'; END IF;checks:=checks+1;
 BEGIN UPDATE public.marketing_post_drafts SET final_copy='Texto diferente' WHERE id=d;RAISE EXCEPTION 'FAIL mutable claimed content';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%locked%' THEN RAISE;END IF;END;checks:=checks+1;
 -- Simulate reclaim after a dead worker, then fence that old worker.
 UPDATE public.marketing_post_drafts SET publish_locked_at=now()-interval '5 minutes' WHERE id=d;
 SELECT * INTO x FROM public.marketing_claim_publish(d);
 IF x.publish_lock_id=old_lock THEN RAISE EXCEPTION 'FAIL stale lock';END IF;
 IF public.marketing_publish_checkpoint(d,old_lock,'{}',true) THEN RAISE EXCEPTION 'FAIL stale worker can send';END IF;checks:=checks+1;
 -- Current project clearance changes after claim: recheck fails at the send boundary.
 UPDATE public.marketing_project_profiles SET clearance='internal_only' WHERE project_id=p;
 BEGIN PERFORM public.marketing_publish_checkpoint(d,x.publish_lock_id,'{}',true);RAISE EXCEPTION 'FAIL clearance';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%internal-only%' THEN RAISE;END IF;END;checks:=checks+1;
 UPDATE public.marketing_project_profiles SET clearance='cleared' WHERE project_id=p;
 IF NOT public.marketing_publish_checkpoint(d,x.publish_lock_id,'{}',true) THEN RAISE EXCEPTION 'FAIL valid send';END IF;
 IF public.marketing_publish_checkpoint(d,x.publish_lock_id,'{}',true) THEN RAISE EXCEPTION 'FAIL second send';END IF;checks:=checks+1;
 PERFORM public.marketing_publish_checkpoint(d,x.publish_lock_id,'{"error":"Outcome unknown","error_code":"network","retry":true}',false);
 SELECT * INTO x FROM public.marketing_post_drafts WHERE id=d;
 IF x.status::text<>'failed' OR x.publish_retry_at IS NOT NULL OR x.publish_sent_at IS NULL THEN RAISE EXCEPTION 'FAIL ambiguous retry';END IF;checks:=checks+1;
 SELECT count(*) INTO count_claim FROM public.marketing_claim_publish(d);IF count_claim<>0 THEN RAISE EXCEPTION 'FAIL unknown claimed';END IF;checks:=checks+1;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
 BEGIN PERFORM public.marketing_schedule_instagram(d,now());RAISE EXCEPTION 'FAIL manual unknown retry';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%outcome unknown%' THEN RAISE;END IF;END;checks:=checks+1;
 PERFORM set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 -- Separate disposable draft proves the real published DB transition, without provider calls.
 INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,project_id,ai_copy,ai_hashtags,rationale,readiness,bible_version,model,format) VALUES(req,gen_random_uuid(),'instagram','{}','{}',p,'Um interior calmo.','{}','test','ready',1,'test','single') RETURNING id INTO d;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
 UPDATE public.marketing_post_drafts SET status='approved' WHERE id=d;
 PERFORM public.marketing_schedule_instagram(d,now()-interval '1 minute');
 PERFORM set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 SELECT * INTO x FROM public.marketing_claim_publish(d);
 PERFORM public.marketing_publish_checkpoint(d,x.publish_lock_id,'{}',true);
 PERFORM public.marketing_publish_checkpoint(d,x.publish_lock_id,'{"media_id":"mock-not-real","permalink":"https://www.instagram.com/p/mock/"}',false);
 SELECT * INTO x FROM public.marketing_post_drafts WHERE id=d;
 IF x.status::text<>'published' OR x.ig_media_id<>'mock-not-real' OR x.ig_published_at IS NULL OR x.published_url IS NULL THEN RAISE EXCEPTION 'FAIL published evidence';END IF;checks:=checks+1;
 RAISE EXCEPTION 'PASS % Instagram database checks; all fixtures rolled back; no Graph calls',checks;
END $$;
