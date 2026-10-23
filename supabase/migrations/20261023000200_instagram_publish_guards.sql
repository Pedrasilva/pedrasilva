CREATE OR REPLACE FUNCTION public.marketing_publish_blocker(d public.marketing_post_drafts) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE h text:=public.marketing_draft_hash(d); r record; p uuid; why text; nd public.marketing_post_drafts;
BEGIN
 IF d.platform::text<>'instagram' THEN RETURN 'Instagram only'; END IF;
 IF d.ig_media_id IS NOT NULL THEN RETURN 'Already published'; END IF;
 IF d.approved_content_hash IS DISTINCT FROM h OR NOT EXISTS(SELECT 1 FROM public.marketing_post_approvals a WHERE a.draft_id=d.id AND a.decision='approved' AND a.voided_at IS NULL AND a.content_hash=h) THEN RETURN 'No valid approval for the current content'; END IF;
 -- Check every referenced project, including captures and all library assets (service jobs have no staff identity).
 FOR p IN SELECT d.project_id WHERE d.project_id IS NOT NULL UNION SELECT c.project_id FROM public.marketing_captures c WHERE c.id=ANY(d.capture_ids) AND c.project_id IS NOT NULL UNION SELECT pr.project_id FROM public.marketing_project_media m JOIN public.marketing_project_profiles pr ON pr.id=m.profile_id WHERE m.id=ANY(d.asset_ids) LOOP
  nd:=d; nd.project_id:=p;
  why:=public.marketing_draft_name_rule_violation(nd); IF why IS NOT NULL THEN RETURN why; END IF;
 END LOOP;
 why:=public.marketing_draft_name_rule_violation(d); IF why IS NOT NULL THEN RETURN why; END IF;
 SELECT * INTO r FROM public.marketing_compute_asset_draft_readiness(d.capture_ids,d.asset_ids,d.project_id,coalesce(d.final_copy,d.ai_copy),coalesce(d.final_hashtags,d.ai_hashtags));
 IF r.readiness::text<>'ready' THEN RETURN coalesce(r.note,'Project clearance does not permit publishing'); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.marketing_publish_blocker(public.marketing_post_drafts) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_publish_blocker(public.marketing_post_drafts) TO service_role;

CREATE OR REPLACE FUNCTION public.marketing_publish_row_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status::text='publishing' OR OLD.publish_sent_at IS NOT NULL OR OLD.ig_media_id IS NOT NULL THEN RAISE EXCEPTION 'Publication evidence cannot be deleted'; END IF; RETURN OLD; END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  IF NEW.status::text='publishing' OR NEW.ig_media_id IS DISTINCT FROM OLD.ig_media_id OR NEW.ig_container_ids IS DISTINCT FROM OLD.ig_container_ids OR NEW.ig_published_at IS DISTINCT FROM OLD.ig_published_at OR NEW.publish_lock_id IS DISTINCT FROM OLD.publish_lock_id OR NEW.publish_locked_at IS DISTINCT FROM OLD.publish_locked_at OR NEW.publish_attempts IS DISTINCT FROM OLD.publish_attempts OR NEW.publish_retry_at IS DISTINCT FROM OLD.publish_retry_at OR NEW.publish_error_code IS DISTINCT FROM OLD.publish_error_code OR NEW.publish_error_message IS DISTINCT FROM OLD.publish_error_message OR NEW.publish_sent_at IS DISTINCT FROM OLD.publish_sent_at OR (NEW.status::text='published' AND NEW.platform::text='instagram' AND OLD.status::text<>'published') THEN RAISE EXCEPTION 'Instagram publishing is server-only'; END IF;
 END IF;
 IF OLD.status::text='publishing' OR OLD.publish_sent_at IS NOT NULL OR OLD.ig_media_id IS NOT NULL THEN
  IF public.marketing_draft_hash(NEW) IS DISTINCT FROM public.marketing_draft_hash(OLD) OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.location_tag IS DISTINCT FROM OLD.location_tag THEN RAISE EXCEPTION 'Publishing content is locked'; END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Publishing evidence is locked'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_aa_publish_guard BEFORE UPDATE OR DELETE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_publish_row_guard();

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE res record; lib uuid;
BEGIN
 IF NEW.ai_copy IS DISTINCT FROM OLD.ai_copy OR NEW.ai_hashtags IS DISTINCT FROM OLD.ai_hashtags OR NEW.capture_ids IS DISTINCT FROM OLD.capture_ids OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.idea_id IS DISTINCT FROM OLD.idea_id OR NEW.platform IS DISTINCT FROM OLD.platform OR NEW.bible_version IS DISTINCT FROM OLD.bible_version OR NEW.model IS DISTINCT FROM OLD.model OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.format IS DISTINCT FROM OLD.format OR NEW.ai_story_frames IS DISTINCT FROM OLD.ai_story_frames THEN RAISE EXCEPTION 'AI original fields of a post draft cannot be changed'; END IF;
 IF NEW.status='published' AND OLD.status IS DISTINCT FROM 'published' AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags OR NEW.final_story_frames IS DISTINCT FROM OLD.final_story_frames) THEN RAISE EXCEPTION 'Save the edit first, then mark as published.'; END IF;
 IF (NEW.readiness IS DISTINCT FROM OLD.readiness OR NEW.readiness_note IS DISTINCT FROM OLD.readiness_note OR NEW.safety_flags IS DISTINCT FROM OLD.safety_flags) AND coalesce(current_setting('marketing.readiness_recheck',true),'')<>'on' THEN RAISE EXCEPTION 'Readiness can only be set by the system recheck'; END IF;
 NEW.edited_after_approval:=OLD.edited_after_approval;
 lib:=public.marketing_draft_library_project(NEW.asset_ids,NEW.capture_ids,NEW.project_id);
 IF OLD.status='approved' AND NEW.status='approved' AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags) THEN
  NEW.status:='suggested'; NEW.edited_after_approval:=true;
  SELECT * INTO res FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids,NEW.asset_ids,NEW.project_id,coalesce(NEW.final_copy,NEW.ai_copy),coalesce(NEW.final_hashtags,NEW.ai_hashtags));
  NEW.readiness:=res.readiness; NEW.readiness_note:=res.note; NEW.safety_flags:=res.flags;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='published' AND OLD.status<>'approved' AND NOT(OLD.status::text='publishing' AND auth.role()='service_role' AND NEW.ig_media_id IS NOT NULL) THEN RAISE EXCEPTION 'Only approved drafts can be marked as published'; END IF;
  IF NEW.status='approved' THEN
   SELECT * INTO res FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids,NEW.asset_ids,NEW.project_id,coalesce(NEW.final_copy,NEW.ai_copy),coalesce(NEW.final_hashtags,NEW.ai_hashtags));
   IF res.readiness<>'ready' THEN RAISE EXCEPTION 'This draft can''t be approved: %',coalesce(res.note,res.readiness::text); END IF;
   NEW.readiness:=res.readiness; NEW.readiness_note:=res.note; NEW.safety_flags:=res.flags; NEW.edited_after_approval:=false;
  END IF;
  NEW.decided_by:=coalesce(auth.uid(),OLD.decided_by); NEW.decided_at:=now();
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_claim_publish(_id uuid DEFAULT NULL) RETURNS SETOF public.marketing_post_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts; why text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 FOR d IN SELECT * FROM public.marketing_post_drafts WHERE platform='instagram' AND ig_media_id IS NULL AND (_id IS NULL OR id=_id) AND
 ((status::text='scheduled' AND scheduled_at<=now()) OR (status::text='failed' AND publish_retry_at<=now() AND publish_attempts<2 AND publish_sent_at IS NULL) OR (status::text='publishing' AND publish_locked_at<now()-interval '4 minutes')) ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 2 LOOP
  why:=public.marketing_publish_blocker(d);
  IF why IS NULL AND d.publish_sent_at IS NOT NULL THEN why:='Publication outcome unknown; verify Instagram before any retry'; END IF;
  IF why IS NOT NULL THEN
   UPDATE public.marketing_post_drafts SET status='failed',publish_error_code='validation',publish_error_message=why,publish_retry_at=NULL,publish_lock_id=NULL,publish_locked_at=NULL WHERE id=d.id;
   INSERT INTO public.marketing_publish_log(draft_id,step,success,meta_error_code,meta_error_message) VALUES(d.id,'preflight',false,'validation',why);
  ELSE
   RETURN QUERY UPDATE public.marketing_post_drafts SET status='publishing',publish_lock_id=gen_random_uuid(),publish_locked_at=now(),publish_attempts=publish_attempts+CASE WHEN d.status::text='publishing' THEN 0 ELSE 1 END,publish_retry_at=NULL,publish_error_code=NULL,publish_error_message=NULL WHERE id=d.id RETURNING *;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.marketing_claim_publish(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.marketing_claim_publish(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.marketing_publish_checkpoint(_id uuid,_lock uuid,_patch jsonb DEFAULT '{}',_send boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts; why text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_id AND status::text='publishing' AND publish_lock_id=_lock FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF _send THEN
  why:=public.marketing_publish_blocker(d); IF why IS NOT NULL THEN RAISE EXCEPTION '%',why; END IF;
  IF d.publish_sent_at IS NOT NULL THEN RETURN false; END IF;
 END IF;
 UPDATE public.marketing_post_drafts SET ig_container_ids=coalesce(_patch->'containers',ig_container_ids),publish_locked_at=now(),publish_sent_at=CASE WHEN _send THEN now() WHEN _patch->>'confirmed_rejection'='true' THEN NULL ELSE publish_sent_at END,
  ig_media_id=coalesce(_patch->>'media_id',ig_media_id),ig_published_at=CASE WHEN _patch->>'media_id' IS NOT NULL THEN now() ELSE ig_published_at END,
  published_at=CASE WHEN _patch->>'media_id' IS NOT NULL THEN (now() AT TIME ZONE 'Europe/Lisbon')::date ELSE published_at END,
  published_url=coalesce(_patch->>'permalink',published_url),status=CASE WHEN _patch->>'media_id' IS NOT NULL THEN 'published'::public.marketing_draft_status WHEN _patch->>'error' IS NOT NULL THEN 'failed'::public.marketing_draft_status ELSE status END,
  publish_error_message=CASE WHEN _patch ? 'error' THEN _patch->>'error' ELSE publish_error_message END,publish_error_code=CASE WHEN _patch ? 'error_code' THEN _patch->>'error_code' ELSE publish_error_code END,
  publish_retry_at=CASE WHEN _patch->>'retry'='true' AND publish_attempts<2 AND (_patch->>'confirmed_rejection'='true' OR publish_sent_at IS NULL) THEN now()+interval '5 minutes' ELSE publish_retry_at END,
  publish_lock_id=CASE WHEN _patch ? 'error' OR _patch ? 'media_id' THEN NULL ELSE publish_lock_id END WHERE id=_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.marketing_publish_checkpoint(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.marketing_publish_checkpoint(uuid,uuid,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.marketing_schedule_instagram(_id uuid,_at timestamptz,_now boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts; why text;
BEGIN
 IF NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _now AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR d.status::text NOT IN ('approved','scheduled','failed') THEN RAISE EXCEPTION 'Only approved posts can be scheduled'; END IF;
 IF d.publish_sent_at IS NOT NULL THEN RAISE EXCEPTION 'Publication outcome unknown; verify Instagram before any retry'; END IF;
 why:=public.marketing_publish_blocker(d); IF why IS NOT NULL THEN RAISE EXCEPTION '%',why; END IF;
 IF _at IS NULL THEN RAISE EXCEPTION 'Set a date and time'; END IF;
 PERFORM set_config('marketing.approval_rpc','on',true);
 IF d.status::text='failed' THEN UPDATE public.marketing_post_drafts SET status='approved' WHERE id=_id; END IF;
 -- Server-maintained retry fields are cleared only by the service worker; manual retries retain attempt history.
 UPDATE public.marketing_post_drafts SET status='scheduled',scheduled_at=CASE WHEN _now THEN now() ELSE _at END WHERE id=_id;
 PERFORM set_config('marketing.approval_rpc','off',true);
END $$;
REVOKE ALL ON FUNCTION public.marketing_schedule_instagram(uuid,timestamptz,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.marketing_schedule_instagram(uuid,timestamptz,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_publish_failure_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.marketing_post_approvals; uid uuid;
BEGIN
 IF NEW.status::text='failed' AND (OLD.status::text<>'failed' OR NEW.publish_error_message IS DISTINCT FROM OLD.publish_error_message) THEN
  SELECT * INTO a FROM public.marketing_post_approvals WHERE draft_id=NEW.id AND decision='approved' ORDER BY decided_at DESC LIMIT 1;
  FOR uid IN SELECT DISTINCT x FROM unnest(ARRAY[a.requested_by,a.approver_id]) x WHERE x IS NOT NULL LOOP
   IF public.has_module_permission(uid,'marketing.view','all') THEN
    INSERT INTO public.notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) VALUES(uid,'marketing_publish_failed','Falha na publicação Instagram',NEW.publish_error_message,'/marketing/posts?draft='||NEW.id,'marketing','marketing_post_draft',NEW.id,'ig-fail-'||NEW.id||'-'||NEW.publish_attempts||'-'||uid) ON CONFLICT DO NOTHING;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_publish_failure_notify AFTER UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_publish_failure_notify();
