CREATE OR REPLACE FUNCTION public.marketing_draft_warning_audit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE issue text; h text; flags text[]; r record;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.warning_confirmation_hash IS NOT NULL OR NEW.warning_approval_history IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Warning evidence is system-owned'; END IF;
  RETURN NEW;
 END IF;
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
CREATE TRIGGER marketing_zz_warning_audit BEFORE INSERT OR UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_draft_warning_audit_guard();
REVOKE ALL ON FUNCTION public.marketing_draft_warning_issue(public.marketing_post_drafts) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_draft_warning_issue(public.marketing_post_drafts) TO authenticated,service_role;