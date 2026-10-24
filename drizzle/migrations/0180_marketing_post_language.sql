ALTER TABLE public.marketing_project_profiles ADD COLUMN post_language text NOT NULL DEFAULT 'en' CHECK (post_language IN ('en','pt-PT','bilingual')), ADD COLUMN instagram_language text CHECK (instagram_language IN ('en','pt-PT','bilingual')), ADD COLUMN linkedin_language text CHECK (linkedin_language IN ('en','pt-PT','bilingual'));
UPDATE public.marketing_project_profiles SET post_language='pt-PT' WHERE id='997fd810-51f9-4bc4-8389-2c94af8a5820' AND project_id='ff0dcfe7-b4df-4d42-a680-00878952b16d';
ALTER TABLE public.marketing_post_requests ADD COLUMN language_override text NOT NULL DEFAULT 'project' CHECK (language_override IN ('project','en','pt-PT','bilingual'));
ALTER TABLE public.marketing_post_drafts ADD COLUMN post_language text NOT NULL DEFAULT 'en' CHECK (post_language IN ('en','pt-PT','bilingual'));
ALTER TABLE public.marketing_post_alternatives ADD COLUMN post_language text NOT NULL DEFAULT 'en' CHECK (post_language IN ('en','pt-PT','bilingual'));
CREATE FUNCTION public.marketing_profile_language_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND ((TG_OP='INSERT' AND (NEW.post_language<>'en' OR NEW.instagram_language IS NOT NULL OR NEW.linkedin_language IS NOT NULL)) OR (TG_OP='UPDATE' AND (NEW.post_language IS DISTINCT FROM OLD.post_language OR NEW.instagram_language IS DISTINCT FROM OLD.instagram_language OR NEW.linkedin_language IS DISTINCT FROM OLD.linkedin_language))) AND NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Post language settings require Marketing curation permission'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER marketing_profile_language_guard BEFORE INSERT OR UPDATE ON public.marketing_project_profiles FOR EACH ROW EXECUTE FUNCTION public.marketing_profile_language_guard();
CREATE FUNCTION public.marketing_draft_language_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.post_language IS DISTINCT FROM OLD.post_language THEN
  IF NOT public.has_module_permission(auth.uid(),'marketing.curate','all') AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Post language edits require Marketing curation permission'; END IF;
  IF OLD.status::text IN ('publishing','published') OR OLD.publish_sent_at IS NOT NULL OR OLD.ig_container_ids<>'[]'::jsonb THEN RAISE EXCEPTION 'Publishing content is locked'; END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER marketing_draft_language_guard BEFORE UPDATE ON public.marketing_post_drafts FOR EACH ROW EXECUTE FUNCTION public.marketing_draft_language_guard();
COMMENT ON COLUMN public.marketing_post_drafts.post_language IS 'Language of effective draft content; metadata does not change the canonical approval hash. Translations change final content and use existing invalidation guards.';