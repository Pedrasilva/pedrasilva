CREATE OR REPLACE FUNCTION public.marketing_finish_reel(_upload uuid,_copy text,_hashtags text[],_share boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.marketing_reel_uploads; p public.marketing_project_profiles; b integer; req uuid; draft uuid; existing uuid;
BEGIN
 IF NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
 -- Serialize finalization without requiring UPDATE rights on immutable upload evidence.
 PERFORM pg_advisory_xact_lock(hashtextextended(_upload::text,0));
 SELECT * INTO r FROM public.marketing_reel_uploads WHERE id=_upload AND created_by=auth.uid();
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