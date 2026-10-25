ALTER TABLE public.marketing_post_drafts DROP CONSTRAINT marketing_post_drafts_format_check;
ALTER TABLE public.marketing_post_drafts ADD CONSTRAINT marketing_post_drafts_format_check CHECK (format IN ('single','carousel','story','reel'));
ALTER TABLE public.marketing_post_drafts ADD COLUMN reel_cover_path text;
ALTER TABLE public.marketing_post_drafts ADD COLUMN reel_share_to_feed boolean NOT NULL DEFAULT true;
CREATE TABLE public.marketing_reel_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL DEFAULT auth.uid(),
 profile_id uuid NOT NULL REFERENCES public.marketing_project_profiles(id),
 video_path text NOT NULL UNIQUE, cover_path text NOT NULL UNIQUE,
 file_name text NOT NULL, mime_type text NOT NULL, metadata jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.marketing_reel_uploads TO authenticated;
GRANT ALL ON public.marketing_reel_uploads TO service_role;
REVOKE TRUNCATE ON public.marketing_reel_uploads FROM anon, authenticated;
ALTER TABLE public.marketing_reel_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_upload_read ON public.marketing_reel_uploads FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE POLICY reel_upload_insert ON public.marketing_reel_uploads FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND public.has_module_permission(auth.uid(),'marketing.curate','all') AND video_path='reels/'||id::text||'/video.'||CASE WHEN mime_type='video/quicktime' THEN 'mov' ELSE 'mp4' END AND cover_path='reels/'||id::text||'/cover.jpg');
CREATE POLICY reel_upload_delete ON public.marketing_reel_uploads FOR DELETE TO authenticated USING (created_by=auth.uid() AND public.has_module_permission(auth.uid(),'marketing.curate','all') AND NOT EXISTS (SELECT 1 FROM public.marketing_post_drafts d WHERE id=ANY(d.asset_ids)));
CREATE POLICY reel_object_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='marketing-assets' AND (storage.foldername(name))[1]='reels' AND public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE POLICY reel_object_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='marketing-assets' AND public.has_module_permission(auth.uid(),'marketing.curate','all') AND EXISTS (SELECT 1 FROM public.marketing_reel_uploads r WHERE r.created_by=auth.uid() AND name IN(r.video_path,r.cover_path) AND NOT EXISTS(SELECT 1 FROM public.marketing_post_drafts d WHERE r.id=ANY(d.asset_ids))));
CREATE POLICY reel_object_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='marketing-assets' AND public.has_module_permission(auth.uid(),'marketing.curate','all') AND EXISTS (SELECT 1 FROM public.marketing_reel_uploads r WHERE r.created_by=auth.uid() AND name IN(r.video_path,r.cover_path) AND NOT EXISTS(SELECT 1 FROM public.marketing_post_drafts d WHERE r.id=ANY(d.asset_ids))));
CREATE OR REPLACE FUNCTION public.marketing_draft_hash(d public.marketing_post_drafts)
RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT public.marketing_post_content_hash(coalesce(d.final_copy,d.ai_copy),coalesce(d.final_hashtags,d.ai_hashtags),
 CASE WHEN d.format='reel' THEN jsonb_build_object('cover',d.reel_cover_path,'share_to_feed',d.reel_share_to_feed) ELSE coalesce(d.final_story_frames,d.ai_story_frames) END,d.asset_ids,d.format);
$$;
CREATE OR REPLACE FUNCTION public.marketing_finish_reel(_upload uuid,_copy text,_hashtags text[],_share boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.marketing_reel_uploads; p public.marketing_project_profiles; b integer; req uuid; draft uuid; existing uuid;
BEGIN
 IF NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO r FROM public.marketing_reel_uploads WHERE id=_upload AND created_by=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Upload not found'; END IF;
 SELECT id INTO existing FROM public.marketing_post_drafts WHERE format='reel' AND _upload=ANY(asset_ids) LIMIT 1;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketing-assets' AND name=r.video_path) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketing-assets' AND name=r.cover_path) THEN RAISE EXCEPTION 'Video and cover must finish uploading'; END IF;
 IF length(coalesce(_copy,'')) + length(array_to_string(coalesce(_hashtags,'{}'),' ')) + cardinality(coalesce(_hashtags,'{}')) > 2198 THEN RAISE EXCEPTION 'Caption and hashtags exceed 2200 characters'; END IF;
 SELECT * INTO p FROM public.marketing_project_profiles WHERE id=r.profile_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project profile not found'; END IF;
 SELECT version INTO b FROM public.marketing_bible_versions ORDER BY version DESC LIMIT 1;
 INSERT INTO public.marketing_post_requests(brief,period_start,period_end,idea_count,story_count,focus_profile_id,status,model,bible_version,finished_at)
 VALUES('Finished reel',current_date,current_date,1,0,p.id,'done','manual',coalesce(b,0),now()) RETURNING id INTO req;
 INSERT INTO public.marketing_post_drafts(request_id,idea_id,platform,capture_ids,asset_ids,project_id,ai_copy,ai_hashtags,final_copy,final_hashtags,rationale,readiness,format,post_language,model,bible_version,reel_cover_path,reel_share_to_feed)
 VALUES(req,gen_random_uuid(),'instagram','{}',ARRAY[r.id],p.project_id,'','{}',coalesce(_copy,''),coalesce(_hashtags,'{}'),'Finished reel','needs_approval','reel',coalesce(p.instagram_language,p.post_language,'en'),'manual',coalesce(b,0),r.cover_path,_share) RETURNING id INTO draft;
 PERFORM public.marketing_recheck_draft_readiness(draft);
 RETURN draft;
END $$;
REVOKE ALL ON FUNCTION public.marketing_finish_reel(uuid,text,text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_finish_reel(uuid,text,text[],boolean) TO authenticated,service_role;
