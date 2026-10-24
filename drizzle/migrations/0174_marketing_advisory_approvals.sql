ALTER TABLE public.marketing_post_drafts ADD COLUMN IF NOT EXISTS warning_confirmation_hash text;
ALTER TABLE public.marketing_post_drafts ADD COLUMN IF NOT EXISTS warning_approval_history jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE res record;
BEGIN
 IF NEW.ai_copy IS DISTINCT FROM OLD.ai_copy OR NEW.ai_hashtags IS DISTINCT FROM OLD.ai_hashtags OR NEW.capture_ids IS DISTINCT FROM OLD.capture_ids OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.idea_id IS DISTINCT FROM OLD.idea_id OR NEW.platform IS DISTINCT FROM OLD.platform OR NEW.bible_version IS DISTINCT FROM OLD.bible_version OR NEW.model IS DISTINCT FROM OLD.model OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.format IS DISTINCT FROM OLD.format OR NEW.ai_story_frames IS DISTINCT FROM OLD.ai_story_frames THEN RAISE EXCEPTION 'AI original fields of a post draft cannot be changed'; END IF;
 IF NEW.status='published' AND OLD.status IS DISTINCT FROM 'published' AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags OR NEW.final_story_frames IS DISTINCT FROM OLD.final_story_frames) THEN RAISE EXCEPTION 'Save the edit first, then mark as published.'; END IF;
 IF (NEW.readiness IS DISTINCT FROM OLD.readiness OR NEW.readiness_note IS DISTINCT FROM OLD.readiness_note OR NEW.safety_flags IS DISTINCT FROM OLD.safety_flags) AND coalesce(current_setting('marketing.readiness_recheck',true),'')<>'on' THEN RAISE EXCEPTION 'Readiness can only be set by the system recheck'; END IF;
 NEW.edited_after_approval:=OLD.edited_after_approval;
 IF OLD.status='approved' AND NEW.status='approved' AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags) THEN
  NEW.status:='suggested'; NEW.edited_after_approval:=true;
  SELECT * INTO res FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids,NEW.asset_ids,NEW.project_id,coalesce(NEW.final_copy,NEW.ai_copy),coalesce(NEW.final_hashtags,NEW.ai_hashtags));
  NEW.readiness:=res.readiness; NEW.readiness_note:=res.note; NEW.safety_flags:=res.flags;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='published' AND OLD.status<>'approved' AND NOT(OLD.status::text='publishing' AND auth.role()='service_role' AND NEW.ig_media_id IS NOT NULL) THEN RAISE EXCEPTION 'Only approved drafts can be marked as published'; END IF;
  IF NEW.status='approved' THEN
   SELECT * INTO res FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids,NEW.asset_ids,NEW.project_id,coalesce(NEW.final_copy,NEW.ai_copy),coalesce(NEW.final_hashtags,NEW.ai_hashtags));
   NEW.readiness:=res.readiness; NEW.readiness_note:=res.note; NEW.safety_flags:=res.flags; NEW.edited_after_approval:=false;
  END IF;
  NEW.decided_by:=coalesce(auth.uid(),OLD.decided_by); NEW.decided_at:=now();
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_post_drafts_approval_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h_new text:=public.marketing_draft_hash(NEW); h_old text:=public.marketing_draft_hash(OLD); via_rpc boolean:=coalesce(current_setting('marketing.approval_rpc',true),'')='on';
BEGIN
 IF h_new IS DISTINCT FROM h_old AND NOT(NEW.status::text='approved' AND OLD.status::text NOT IN ('approved','scheduled')) THEN
  NEW.approved_content_hash:=NULL;
  IF NEW.status::text IN ('approved','scheduled','pending_approval') THEN NEW.status:='suggested'; END IF;
  IF OLD.status::text IN ('approved','scheduled') THEN NEW.edited_after_approval:=true; END IF;
 END IF;
 IF NEW.status::text='pending_approval' AND OLD.status::text<>'pending_approval' AND NOT via_rpc THEN RAISE EXCEPTION 'Use «Pedir aprovação» to request an approval'; END IF;
 IF NEW.status::text='approved' AND OLD.status::text NOT IN ('approved','scheduled') THEN NEW.approved_content_hash:=h_new; END IF;
 IF NEW.status::text='scheduled' THEN
  IF NEW.scheduled_at IS NULL THEN RAISE EXCEPTION 'Set a date and time before scheduling'; END IF;
  IF OLD.status::text NOT IN ('approved','scheduled') THEN RAISE EXCEPTION 'Only approved drafts can be scheduled'; END IF;
  IF NEW.approved_content_hash IS DISTINCT FROM h_new OR NOT EXISTS(SELECT 1 FROM public.marketing_post_approvals a WHERE a.draft_id=NEW.id AND a.decision='approved' AND a.voided_at IS NULL AND a.content_hash=h_new) THEN RAISE EXCEPTION 'No valid approval for the current content'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_request_post_approval(_draft uuid,_approver uuid,_comment text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts; aid uuid;
BEGIN
 IF NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _approver=auth.uid() THEN RAISE EXCEPTION 'Choose a colleague, not yourself'; END IF;
 IF NOT public.has_module_permission(_approver,'marketing.view','all') THEN RAISE EXCEPTION 'This colleague has no Marketing access'; END IF;
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_draft FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
 IF d.status::text NOT IN ('suggested','pending_approval') THEN RAISE EXCEPTION 'Only suggested drafts can be sent for approval'; END IF;
 UPDATE public.marketing_post_approvals SET voided_at=now() WHERE draft_id=_draft AND decision='pending' AND voided_at IS NULL;
 INSERT INTO public.marketing_post_approvals(draft_id,requested_by,approver_id,comment,content_hash) VALUES(_draft,auth.uid(),_approver,nullif(btrim(coalesce(_comment,'')),''),public.marketing_draft_hash(d)) RETURNING id INTO aid;
 PERFORM set_config('marketing.approval_rpc','on',true);
 UPDATE public.marketing_post_drafts SET status='pending_approval' WHERE id=_draft;
 PERFORM set_config('marketing.approval_rpc','off',true);
 INSERT INTO public.notifications(user_id,kind,title,body,link_path,module,entity_type,entity_id,dedupe_key) VALUES(_approver,'marketing_post_approval','Pedido de aprovação de publicação',left(coalesce(d.final_copy,d.ai_copy),160),'/marketing/posts?draft='||_draft,'marketing','marketing_post_approval',aid,'mpa-req-'||aid);
 RETURN aid;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_publish_blocker(d public.marketing_post_drafts) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE h text:=public.marketing_draft_hash(d);
BEGIN
 IF d.platform::text<>'instagram' THEN RETURN 'Instagram only'; END IF;
 IF d.ig_media_id IS NOT NULL THEN RETURN 'Already published'; END IF;
 IF d.approved_content_hash IS DISTINCT FROM h OR NOT EXISTS(SELECT 1 FROM public.marketing_post_approvals a WHERE a.draft_id=d.id AND a.decision='approved' AND a.voided_at IS NULL AND a.content_hash=h) THEN RETURN 'No valid approval for the current content'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_draft_warning_issue(d public.marketing_post_drafts) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p uuid; nd public.marketing_post_drafts; issue text;
BEGIN
 FOR p IN SELECT d.project_id WHERE d.project_id IS NOT NULL UNION SELECT c.project_id FROM public.marketing_captures c WHERE c.id=ANY(d.capture_ids) AND c.project_id IS NOT NULL UNION SELECT pr.project_id FROM public.marketing_project_media m JOIN public.marketing_project_profiles pr ON pr.id=m.profile_id WHERE m.id=ANY(d.asset_ids) LOOP
  nd:=d; nd.project_id:=p; issue:=public.marketing_draft_name_rule_violation(nd); IF issue IS NOT NULL THEN RETURN issue; END IF;
 END LOOP;
 RETURN public.marketing_draft_name_rule_violation(d);
END $$;
CREATE OR REPLACE FUNCTION public.marketing_review_draft_warnings(_draft uuid,_patch jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d public.marketing_post_drafts;
BEGIN
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_draft; IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
 IF _patch ? 'final_copy' THEN d.final_copy:=_patch->>'final_copy'; END IF;
 IF _patch ? 'final_hashtags' THEN SELECT coalesce(array_agg(x),'{}') INTO d.final_hashtags FROM jsonb_array_elements_text(_patch->'final_hashtags') x; END IF;
 IF _patch ? 'final_story_frames' THEN d.final_story_frames:=_patch->'final_story_frames'; END IF;
 RETURN jsonb_build_object('hash',public.marketing_draft_hash(d),'issue',public.marketing_draft_warning_issue(d),'flags',d.safety_flags,'note',d.readiness_note);
END $$;
CREATE OR REPLACE FUNCTION public.marketing_confirm_draft_warning(_draft uuid,_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.marketing_post_drafts;
BEGIN
 IF NOT public.is_psa_staff() OR NOT(public.has_module_permission(auth.uid(),'marketing.curate','all') OR EXISTS(SELECT 1 FROM public.marketing_post_approvals WHERE draft_id=_draft AND approver_id=auth.uid() AND decision='pending' AND voided_at IS NULL)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO d FROM public.marketing_post_drafts WHERE id=_draft FOR UPDATE;
 IF NOT FOUND OR public.marketing_draft_hash(d) IS DISTINCT FROM _hash THEN RAISE EXCEPTION 'Content changed; review again'; END IF;
 PERFORM set_config('marketing.warning_confirmation','on',true);
 UPDATE public.marketing_post_drafts SET warning_confirmation_hash=_hash WHERE id=_draft;
 PERFORM set_config('marketing.warning_confirmation','off',true);
END $$;
CREATE OR REPLACE FUNCTION public.marketing_draft_warning_audit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE issue text; h text; flags text[]; r record;
BEGIN
 IF NEW.warning_confirmation_hash IS DISTINCT FROM OLD.warning_confirmation_hash AND coalesce(current_setting('marketing.warning_confirmation',true),'')<>'on' THEN RAISE EXCEPTION 'Use the warning confirmation action'; END IF;
 IF NEW.warning_approval_history IS DISTINCT FROM OLD.warning_approval_history THEN RAISE EXCEPTION 'Warning approval history is system-owned'; END IF;
 h:=public.marketing_draft_hash(NEW);
 IF h IS DISTINCT FROM public.marketing_draft_hash(OLD) THEN NEW.warning_confirmation_hash:=NULL; END IF;
 IF NEW.status::text='approved' AND OLD.status::text NOT IN ('approved','scheduled') THEN
  issue:=public.marketing_draft_warning_issue(NEW);
  IF issue IS NOT NULL AND NEW.warning_confirmation_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Confirm publication concern first: %',issue; END IF;
  SELECT * INTO r FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids,NEW.asset_ids,NEW.project_id,coalesce(NEW.final_copy,NEW.ai_copy),coalesce(NEW.final_hashtags,NEW.ai_hashtags));
  flags:=coalesce(r.flags,'{}'); IF issue IS NOT NULL THEN flags:=array_append(flags,issue); END IF;
  IF r.readiness::text<>'ready' OR cardinality(flags)>0 THEN NEW.warning_approval_history:=coalesce(OLD.warning_approval_history,'[]')||jsonb_build_array(jsonb_build_object('who',auth.uid(),'when',now(),'hash',h,'readiness',r.readiness,'note',r.note,'flags',flags,'named_client_confirmed',issue IS NOT NULL)); END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marketing_zz_warning_audit ON public.marketing_post_drafts;
CREATE TRIGGER marketing_zz_warning_audit BEFORE UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_draft_warning_audit_guard();
DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.marketing_post_drafts'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%readiness%' AND pg_get_constraintdef(oid) ILIKE '%approved%' LOOP EXECUTE format('ALTER TABLE public.marketing_post_drafts DROP CONSTRAINT %I',c.conname); END LOOP; END $$;
REVOKE ALL ON FUNCTION public.marketing_confirm_draft_warning(uuid,text),public.marketing_review_draft_warnings(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_confirm_draft_warning(uuid,text),public.marketing_review_draft_warnings(uuid,jsonb) TO authenticated;