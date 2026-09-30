ALTER TABLE public.marketing_email_ignored DROP CONSTRAINT marketing_email_ignored_reason_check;
ALTER TABLE public.marketing_email_ignored ADD CONSTRAINT marketing_email_ignored_reason_check
  CHECK (reason IN ('external_sender','unsupported_type','attachment_too_large','inline_image','empty','deleted_capture'));

CREATE OR REPLACE FUNCTION public.marketing_capture_delete_block(_capture_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _capture_id = ANY(capture_ids) AND status = 'published') THEN 'published'
    WHEN EXISTS (SELECT 1 FROM marketing_post_drafts WHERE _capture_id = ANY(capture_ids)) THEN
      'drafts:' || (SELECT count(*) FROM marketing_post_drafts WHERE _capture_id = ANY(capture_ids))::text
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION public.marketing_capture_delete_block(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.marketing_captures_guard_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b text;
BEGIN
  _b := public.marketing_capture_delete_block(OLD.id);
  IF _b = 'published' THEN RAISE EXCEPTION 'capture_used_in_published_post'; END IF;
  IF _b IS NOT NULL THEN RAISE EXCEPTION 'capture_used_in_drafts:%', split_part(_b, ':', 2); END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.has_module_permission(auth.uid(), 'marketing.curate', 'all')
     AND NOT (OLD.created_by = auth.uid() AND OLD.status IN ('new','enriched')) THEN
    RAISE EXCEPTION 'not_allowed_to_delete_capture';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER marketing_captures_guard_delete BEFORE DELETE ON public.marketing_captures
  FOR EACH ROW EXECUTE FUNCTION public.marketing_captures_guard_delete();

GRANT DELETE ON public.marketing_captures TO authenticated;
CREATE POLICY mc_delete ON public.marketing_captures FOR DELETE TO authenticated
  USING (
    public.marketing_capture_delete_block(id) IS NULL AND (
      public.has_module_permission(auth.uid(), 'marketing.curate', 'all')
      OR (created_by = auth.uid() AND status IN ('new','enriched'))
    )
  );