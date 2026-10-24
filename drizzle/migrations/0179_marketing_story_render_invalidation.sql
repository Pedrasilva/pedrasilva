CREATE OR REPLACE FUNCTION public.marketing_story_render_invalidate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.marketing_draft_hash(NEW) IS DISTINCT FROM public.marketing_draft_hash(OLD) THEN NEW.story_render_manifest:=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_story_zz_render_invalidate BEFORE UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_story_render_invalidate();
