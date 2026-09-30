ALTER TABLE public.marketing_post_drafts ADD COLUMN IF NOT EXISTS edited_after_approval boolean NOT NULL DEFAULT false;

GRANT DELETE ON public.marketing_post_drafts TO authenticated;
GRANT DELETE ON public.marketing_post_requests TO authenticated;

CREATE POLICY mpd_delete ON public.marketing_post_drafts FOR DELETE TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));
CREATE POLICY mpr_delete ON public.marketing_post_requests FOR DELETE TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published drafts are the record of what went out and cannot be deleted';
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_post_drafts_guard_delete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER marketing_post_drafts_guard_delete BEFORE DELETE ON public.marketing_post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_post_drafts_guard_delete();

CREATE OR REPLACE FUNCTION public.marketing_post_drafts_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res record;
BEGIN
  IF NEW.ai_copy IS DISTINCT FROM OLD.ai_copy OR NEW.ai_hashtags IS DISTINCT FROM OLD.ai_hashtags
     OR NEW.capture_ids IS DISTINCT FROM OLD.capture_ids OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.idea_id IS DISTINCT FROM OLD.idea_id OR NEW.platform IS DISTINCT FROM OLD.platform
     OR NEW.bible_version IS DISTINCT FROM OLD.bible_version OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI original fields of a post draft cannot be changed';
  END IF;
  IF (NEW.readiness IS DISTINCT FROM OLD.readiness OR NEW.readiness_note IS DISTINCT FROM OLD.readiness_note
      OR NEW.safety_flags IS DISTINCT FROM OLD.safety_flags)
     AND coalesce(current_setting('marketing.readiness_recheck', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Readiness can only be set by the system recheck';
  END IF;
  -- edited_after_approval is system-managed
  NEW.edited_after_approval := OLD.edited_after_approval;

  -- Edits after approval send the draft back to suggested and recheck readiness.
  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND (NEW.final_copy IS DISTINCT FROM OLD.final_copy OR NEW.final_hashtags IS DISTINCT FROM OLD.final_hashtags) THEN
    NEW.status := 'suggested';
    NEW.edited_after_approval := true;
    SELECT * INTO res FROM public.marketing_compute_draft_readiness(NEW.capture_ids,
      coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags));
    NEW.readiness := res.readiness; NEW.readiness_note := res.note; NEW.safety_flags := res.flags;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'Only approved drafts can be marked as published';
    END IF;
    IF NEW.status = 'approved' THEN
      SELECT * INTO res FROM public.marketing_compute_draft_readiness(NEW.capture_ids,
        coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags));
      IF res.readiness <> 'ready' THEN
        RAISE EXCEPTION 'This draft can''t be approved: %', coalesce(res.note, res.readiness::text);
      END IF;
      NEW.readiness := res.readiness; NEW.readiness_note := res.note; NEW.safety_flags := res.flags;
      NEW.edited_after_approval := false;
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_post_drafts_guard() FROM PUBLIC, anon, authenticated;