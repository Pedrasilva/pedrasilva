-- Keep container evidence tied to its original content; previously built containers must not survive edited retries.
CREATE OR REPLACE FUNCTION public.marketing_publish_container_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (NEW.status::text IN ('publishing','published') OR NEW.ig_media_id IS NOT NULL OR NEW.publish_sent_at IS NOT NULL OR NEW.publish_lock_id IS NOT NULL OR NEW.ig_container_ids<>'[]'::jsonb) THEN RAISE EXCEPTION 'Instagram publication evidence is server-only'; END IF;
 ELSE
  IF (OLD.ig_container_ids<>'[]'::jsonb OR OLD.status::text='publishing' OR OLD.publish_sent_at IS NOT NULL) AND (public.marketing_draft_hash(NEW) IS DISTINCT FROM public.marketing_draft_hash(OLD) OR NEW.capture_ids IS DISTINCT FROM OLD.capture_ids OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.location_tag IS DISTINCT FROM OLD.location_tag) THEN RAISE EXCEPTION 'Created Instagram containers lock the approved content; duplicate the draft for a new version'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_ab_container_guard BEFORE INSERT OR UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_publish_container_guard();
-- Retry approval must stay the existing, valid colleague approval; no synthetic direct approval row on failed -> approved.
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
 UPDATE public.marketing_post_drafts SET status='scheduled',scheduled_at=CASE WHEN _now THEN now() ELSE _at END WHERE id=_id;
 PERFORM set_config('marketing.approval_rpc','off',true);
END $$;
REVOKE ALL ON FUNCTION public.marketing_publish_container_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_publish_container_guard() TO service_role;
-- Clients cannot inject a live-feed payload through inserts or settings updates.
CREATE OR REPLACE FUNCTION public.marketing_feed_cache_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND (NEW.instagram_feed IS DISTINCT FROM OLD.instagram_feed OR NEW.instagram_feed_at IS DISTINCT FROM OLD.instagram_feed_at OR NEW.instagram_feed_error IS DISTINCT FROM OLD.instagram_feed_error) THEN RAISE EXCEPTION 'Live Instagram feed cache is server-only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_feed_cache_guard BEFORE UPDATE ON public.marketing_settings FOR EACH ROW EXECUTE FUNCTION public.marketing_feed_cache_guard();
REVOKE ALL ON FUNCTION public.marketing_feed_cache_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_feed_cache_guard() TO service_role;