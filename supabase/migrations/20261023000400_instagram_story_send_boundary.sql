-- Persist a separate submission boundary for each Story frame in the existing container ledger.
CREATE OR REPLACE FUNCTION public.marketing_story_send(_id uuid,_lock uuid,_container text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts; why text; c jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_id AND status::text='publishing' AND publish_lock_id=_lock FOR UPDATE;
 IF NOT FOUND OR d.format::text<>'story' THEN RETURN false;END IF;
 why:=public.marketing_publish_blocker(d);IF why IS NOT NULL THEN RAISE EXCEPTION '%',why;END IF;
 SELECT value INTO c FROM jsonb_array_elements(d.ig_container_ids) WHERE value->>'id'=_container AND value->>'role'='story';
 IF c IS NULL OR c->>'submitted'='true' THEN RETURN false;END IF;
 UPDATE public.marketing_post_drafts SET publish_sent_at=coalesce(publish_sent_at,now()),publish_locked_at=now(),ig_container_ids=(SELECT jsonb_agg(CASE WHEN value->>'id'=_container THEN value||jsonb_build_object('submitted',true) ELSE value END ORDER BY ord) FROM jsonb_array_elements(d.ig_container_ids) WITH ORDINALITY t(value,ord)) WHERE id=_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.marketing_story_send(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_story_send(uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.marketing_claim_publish(_id uuid DEFAULT NULL) RETURNS SETOF public.marketing_post_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts;why text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only';END IF;
 FOR d IN SELECT * FROM public.marketing_post_drafts WHERE platform='instagram' AND ig_media_id IS NULL AND (_id IS NULL OR id=_id) AND ((status::text='scheduled' AND scheduled_at<=now()) OR (status::text='failed' AND publish_retry_at<=now() AND publish_attempts<2 AND publish_sent_at IS NULL) OR (status::text='publishing' AND publish_locked_at<now()-interval '4 minutes')) ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 2 LOOP
  why:=public.marketing_publish_blocker(d);
  IF why IS NULL AND d.publish_sent_at IS NOT NULL THEN why:='Publication outcome unknown; verify Instagram before any retry';END IF;
  IF why IS NOT NULL THEN
   RETURN QUERY UPDATE public.marketing_post_drafts SET status='failed',publish_error_code='validation',publish_error_message=why,publish_retry_at=NULL,publish_lock_id=NULL,publish_locked_at=NULL WHERE id=d.id RETURNING *;
   INSERT INTO public.marketing_publish_log(draft_id,step,success,meta_error_code,meta_error_message) VALUES(d.id,'preflight',false,'validation',why);
  ELSE
   RETURN QUERY UPDATE public.marketing_post_drafts SET status='publishing',publish_lock_id=gen_random_uuid(),publish_locked_at=now(),publish_attempts=publish_attempts+CASE WHEN d.status::text='publishing' THEN 0 ELSE 1 END,publish_retry_at=NULL,publish_error_code=NULL,publish_error_message=NULL WHERE id=d.id RETURNING *;
  END IF;
 END LOOP;
END $$;