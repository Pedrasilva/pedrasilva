CREATE OR REPLACE FUNCTION public.marketing_reel_purge_eligible(_upload uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM marketing_reel_uploads r WHERE r.id=_upload AND r.video_purged_at IS NULL
 AND r.video_path='reels/'||r.id::text||'/video.'||CASE WHEN r.mime_type='video/quicktime' THEN 'mov' ELSE 'mp4' END
 AND r.mime_type IN ('video/mp4','video/quicktime') AND r.video_path<>r.cover_path
 AND EXISTS(SELECT 1 FROM marketing_post_drafts d WHERE r.id=ANY(d.asset_ids))
 AND NOT EXISTS(SELECT 1 FROM marketing_post_drafts d WHERE r.id=ANY(d.asset_ids) AND NOT coalesce((
 d.format='reel' AND d.platform::text='instagram' AND d.status::text='published'
 AND nullif(trim(d.ig_media_id),'') IS NOT NULL AND d.published_at IS NOT NULL
 AND (d.published_at::timestamp AT TIME ZONE 'UTC')+interval '30 days'<=now()
 AND (d.ig_published_at IS NULL OR d.ig_published_at+interval '30 days'<=now())
 AND d.publish_lock_id IS NULL AND d.publish_retry_at IS NULL AND d.publish_error_code IS NULL AND d.publish_error_message IS NULL
 ),false)));
$$;
REVOKE ALL ON FUNCTION public.marketing_reel_purge_eligible(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_reel_purge_eligible(uuid) TO service_role;