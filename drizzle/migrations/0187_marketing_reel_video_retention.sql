ALTER TABLE public.marketing_post_drafts ADD COLUMN video_purged_at timestamptz, ADD COLUMN video_purged_bytes bigint;
ALTER TABLE public.marketing_reel_uploads ADD COLUMN video_purged_at timestamptz, ADD COLUMN video_purge_claim uuid, ADD COLUMN video_purge_bytes bigint;
ALTER TABLE public.marketing_settings ADD COLUMN reel_cleanup_checked_at timestamptz;
COMMENT ON COLUMN public.marketing_post_drafts.video_purged_at IS 'Owner-authorized removal of full-size published reel video only; offline original retained. Not part of approval hash.';

CREATE FUNCTION public.marketing_reel_purge_eligible(_upload uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM marketing_reel_uploads r WHERE r.id=_upload AND r.video_purged_at IS NULL
 AND r.video_path='reels/'||r.id::text||'/video.'||CASE WHEN r.mime_type='video/quicktime' THEN 'mov' ELSE 'mp4' END
 AND r.mime_type IN ('video/mp4','video/quicktime') AND r.video_path<>r.cover_path
 AND EXISTS(SELECT 1 FROM marketing_post_drafts d WHERE r.id=ANY(d.asset_ids))
 AND NOT EXISTS(SELECT 1 FROM marketing_post_drafts d WHERE r.id=ANY(d.asset_ids) AND NOT (
 d.format='reel' AND d.platform::text='instagram' AND d.status::text='published'
 AND nullif(trim(d.ig_media_id),'') IS NOT NULL AND d.published_at IS NOT NULL
 AND (d.published_at::timestamp AT TIME ZONE 'UTC')+interval '30 days'<=now()
 AND (d.ig_published_at IS NULL OR d.ig_published_at+interval '30 days'<=now())
 AND d.publish_lock_id IS NULL AND d.publish_retry_at IS NULL AND d.publish_error_code IS NULL AND d.publish_error_message IS NULL
 )));
$$;
REVOKE ALL ON FUNCTION public.marketing_reel_purge_eligible(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_reel_purge_eligible(uuid) TO service_role;

CREATE FUNCTION public.marketing_reel_purge_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid; r marketing_reel_uploads;
BEGIN
 IF TG_TABLE_NAME='marketing_post_drafts' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.video_purged_at IS NOT NULL OR NEW.video_purged_bytes IS NOT NULL THEN RAISE EXCEPTION 'Purge evidence is server-only'; END IF;
  ELSIF (NEW.video_purged_at IS DISTINCT FROM OLD.video_purged_at OR NEW.video_purged_bytes IS DISTINCT FROM OLD.video_purged_bytes)
   AND (auth.role() IS DISTINCT FROM 'service_role' OR coalesce(current_setting('marketing.reel_purge',true),'')<>'on') THEN RAISE EXCEPTION 'Purge evidence is RPC-only'; END IF;
  FOREACH a IN ARRAY NEW.asset_ids LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(a::text,0));
   SELECT * INTO r FROM marketing_reel_uploads WHERE id=a;
   IF FOUND AND (r.video_purge_claim IS NOT NULL OR r.video_purged_at IS NOT NULL) THEN
    IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Reusing this reel requires a new upload'; END IF;
    IF NOT(a=ANY(OLD.asset_ids)) OR NEW.status IS DISTINCT FROM OLD.status OR marketing_draft_hash(NEW) IS DISTINCT FROM marketing_draft_hash(OLD) THEN RAISE EXCEPTION 'Reusing this reel requires a new upload'; END IF;
   END IF;
  END LOOP;
 ELSE
  IF TG_OP='INSERT' THEN
   IF NEW.video_purged_at IS NOT NULL OR NEW.video_purge_claim IS NOT NULL OR NEW.video_purge_bytes IS NOT NULL THEN RAISE EXCEPTION 'Purge evidence is RPC-only'; END IF;
  ELSIF (NEW.video_purged_at IS DISTINCT FROM OLD.video_purged_at OR NEW.video_purge_claim IS DISTINCT FROM OLD.video_purge_claim OR NEW.video_purge_bytes IS DISTINCT FROM OLD.video_purge_bytes)
   AND (auth.role() IS DISTINCT FROM 'service_role' OR coalesce(current_setting('marketing.reel_purge',true),'')<>'on') THEN RAISE EXCEPTION 'Purge evidence is RPC-only'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_reel_purge_guard BEFORE INSERT OR UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_reel_purge_guard();
CREATE TRIGGER marketing_reel_upload_purge_guard BEFORE INSERT OR UPDATE ON public.marketing_reel_uploads FOR EACH ROW EXECUTE FUNCTION public.marketing_reel_purge_guard();

CREATE FUNCTION public.marketing_claim_reel_cleanup() RETURNS TABLE(upload_id uuid,video_path text,claim_id uuid,purged_bytes bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage AS $$
DECLARE r marketing_reel_uploads; checked timestamptz; bytes bigint; claim uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only'; END IF;
 SELECT reel_cleanup_checked_at INTO checked FROM marketing_settings WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF checked IS NOT NULL AND checked>now()-interval '1 day' THEN RETURN; END IF;
 UPDATE marketing_settings SET reel_cleanup_checked_at=now() WHERE id=true;
 PERFORM set_config('marketing.reel_purge','on',true);
 FOR r IN SELECT * FROM marketing_reel_uploads u WHERE u.video_purged_at IS NULL AND marketing_reel_purge_eligible(u.id) ORDER BY u.created_at LIMIT 100 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(r.id::text,0));
  IF NOT marketing_reel_purge_eligible(r.id) THEN CONTINUE; END IF;
  bytes:=r.video_purge_bytes;
  IF r.video_purge_claim IS NULL THEN
   SELECT CASE WHEN (o.metadata->>'size') ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint ELSE NULL END INTO bytes FROM storage.objects o WHERE o.bucket_id='marketing-assets' AND o.name=r.video_path;
   IF bytes IS NULL OR bytes<=0 OR bytes>1073741824 THEN CONTINUE; END IF;
  END IF;
  claim:=coalesce(r.video_purge_claim,gen_random_uuid());
  UPDATE marketing_reel_uploads SET video_purge_claim=claim,video_purge_bytes=bytes WHERE id=r.id;
  INSERT INTO marketing_publish_log(draft_id,step,success,meta_error_message) SELECT d.id,'video_purge_claimed',true,jsonb_build_object('bytes',bytes,'upload_id',r.id)::text FROM marketing_post_drafts d WHERE r.id=ANY(d.asset_ids);
  upload_id:=r.id; video_path:=r.video_path; claim_id:=claim; purged_bytes:=bytes; RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.marketing_claim_reel_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_claim_reel_cleanup() TO service_role;

CREATE FUNCTION public.marketing_complete_reel_purge(_upload uuid,_claim uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage AS $$
DECLARE r marketing_reel_uploads;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_upload::text,0));
 SELECT * INTO r FROM marketing_reel_uploads WHERE id=_upload FOR UPDATE;
 IF NOT FOUND OR r.video_purge_claim IS DISTINCT FROM _claim OR _claim IS NULL THEN RETURN false; END IF;
 IF r.video_purged_at IS NOT NULL THEN RETURN true; END IF;
 IF NOT marketing_reel_purge_eligible(r.id) OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketing-assets' AND name=r.video_path) THEN RETURN false; END IF;
 PERFORM set_config('marketing.reel_purge','on',true);
 UPDATE marketing_post_drafts SET video_purged_at=now(),video_purged_bytes=r.video_purge_bytes WHERE r.id=ANY(asset_ids);
 UPDATE marketing_reel_uploads SET video_purged_at=now() WHERE id=r.id;
 INSERT INTO marketing_publish_log(draft_id,step,success,meta_error_message) SELECT d.id,'video_purged',true,jsonb_build_object('bytes',r.video_purge_bytes,'upload_id',r.id)::text FROM marketing_post_drafts d WHERE r.id=ANY(d.asset_ids);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.marketing_complete_reel_purge(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_complete_reel_purge(uuid,uuid) TO service_role;