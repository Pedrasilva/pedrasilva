CREATE VIEW public.marketing_draft_approval_state WITH (security_invoker=true) AS
SELECT d.id, public.marketing_draft_hash(d) AS current_hash,
 (d.approved_content_hash = public.marketing_draft_hash(d) AND EXISTS (
 SELECT 1 FROM public.marketing_post_approvals a WHERE a.draft_id=d.id AND a.decision='approved' AND a.voided_at IS NULL AND a.content_hash=public.marketing_draft_hash(d))) IS TRUE AS valid_approval
FROM public.marketing_post_drafts d;
REVOKE ALL ON public.marketing_draft_approval_state FROM PUBLIC,anon;
GRANT SELECT ON public.marketing_draft_approval_state TO authenticated,service_role;

-- Return stale, unsent content to the existing editorial path; no approval or publication bypass.
CREATE FUNCTION public.marketing_prepare_reapproval(_draft uuid) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d public.marketing_post_drafts; h text;
BEGIN
 IF NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_draft FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
 IF d.status::text IN ('suggested','pending_approval') THEN RETURN; END IF;
 IF d.status::text NOT IN ('failed','approved','scheduled') OR d.publish_sent_at IS NOT NULL OR d.ig_media_id IS NOT NULL OR d.publish_lock_id IS NOT NULL THEN RAISE EXCEPTION 'Publishing evidence is locked'; END IF;
 h:=public.marketing_draft_hash(d);
 IF d.approved_content_hash=h AND EXISTS(SELECT 1 FROM public.marketing_post_approvals a WHERE a.draft_id=d.id AND a.decision='approved' AND a.voided_at IS NULL AND a.content_hash=h) THEN RAISE EXCEPTION 'Current content already has a valid approval'; END IF;
 UPDATE public.marketing_post_drafts SET status='suggested' WHERE id=_draft;
END $$;
REVOKE ALL ON FUNCTION public.marketing_prepare_reapproval(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_prepare_reapproval(uuid) TO authenticated;

CREATE FUNCTION public.marketing_request_post_reapproval(_draft uuid,_approver uuid,_comment text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM public.marketing_prepare_reapproval(_draft);
 RETURN public.marketing_request_post_approval(_draft,_approver,_comment);
END $$;
REVOKE ALL ON FUNCTION public.marketing_request_post_reapproval(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_request_post_reapproval(uuid,uuid,text) TO authenticated;

-- Runs after all existing BEFORE guards. Only a normal fresh approval clears the active error.
-- The original failure remains in the existing attempt log; counters/send/lock evidence are untouched.
CREATE FUNCTION public.marketing_reapproval_clear_failure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status::text='approved' AND OLD.status::text NOT IN ('approved','scheduled')
 AND NEW.approved_content_hash=public.marketing_draft_hash(NEW)
 AND OLD.publish_sent_at IS NULL AND OLD.ig_media_id IS NULL AND OLD.publish_lock_id IS NULL
 AND (OLD.publish_error_message IS NOT NULL OR OLD.publish_error_code IS NOT NULL) THEN
  IF NOT EXISTS(SELECT 1 FROM public.marketing_publish_log l WHERE l.draft_id=OLD.id AND NOT l.success AND l.meta_error_code IS NOT DISTINCT FROM OLD.publish_error_code AND l.meta_error_message IS NOT DISTINCT FROM OLD.publish_error_message) THEN
   INSERT INTO public.marketing_publish_log(draft_id,step,success,meta_error_code,meta_error_message)
   VALUES(OLD.id,'failure_before_reapproval',false,OLD.publish_error_code,OLD.publish_error_message);
  END IF;
  NEW.publish_error_code:=NULL; NEW.publish_error_message:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.marketing_reapproval_clear_failure() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER marketing_zzz_reapproval_clear_failure BEFORE UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_reapproval_clear_failure();