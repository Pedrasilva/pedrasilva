ALTER TABLE public.marketing_project_profiles ADD COLUMN marketing_key uuid, ADD COLUMN internal_name text, ADD COLUMN internal_client text;
UPDATE public.marketing_project_profiles SET marketing_key=project_id;
ALTER TABLE public.marketing_project_profiles ALTER COLUMN marketing_key SET DEFAULT gen_random_uuid();
ALTER TABLE public.marketing_project_profiles ALTER COLUMN marketing_key SET NOT NULL;
CREATE UNIQUE INDEX marketing_profiles_key ON public.marketing_project_profiles(marketing_key);
ALTER TABLE public.marketing_captures ADD COLUMN profile_id uuid REFERENCES public.marketing_project_profiles(id);
UPDATE public.marketing_captures c SET profile_id=p.id FROM public.marketing_project_profiles p WHERE p.project_id=c.project_id;
CREATE INDEX marketing_capture_profile ON public.marketing_captures(profile_id);
CREATE OR REPLACE VIEW public.marketing_project_directory WITH (security_invoker=true) AS
SELECT coalesce(p.marketing_key,pr.id) id,pr.name,pr.client,p.id profile_id,false portfolio FROM public.pm_projects pr LEFT JOIN public.marketing_project_profiles p ON p.project_id=pr.id
UNION ALL SELECT p.marketing_key,p.internal_name,p.internal_client,p.id,true FROM public.marketing_project_profiles p WHERE p.project_id IS NULL;
GRANT SELECT ON public.marketing_project_directory TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.marketing_capture_key(c public.marketing_captures) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT marketing_key FROM public.marketing_project_profiles WHERE id=c.profile_id),c.project_id) $$;
CREATE OR REPLACE FUNCTION public.marketing_profile_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='marketing_project_profiles' THEN
  IF TG_OP='INSERT' THEN
   IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
   IF NEW.project_id IS NOT NULL THEN NEW.marketing_key:=NEW.project_id; END IF;
  ELSE
   IF NEW.marketing_key IS DISTINCT FROM OLD.marketing_key THEN RAISE EXCEPTION 'Marketing identity is immutable'; END IF;
   IF (NEW.internal_name,NEW.internal_client,NEW.project_id) IS DISTINCT FROM (OLD.internal_name,OLD.internal_client,OLD.project_id) AND auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.project_id IS NULL AND nullif(trim(NEW.internal_name),'') IS NULL THEN RAISE EXCEPTION 'Portfolio name is required'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.profile_id IS NOT DISTINCT FROM OLD.profile_id AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
   SELECT id INTO NEW.profile_id FROM public.marketing_project_profiles WHERE project_id=NEW.project_id;
  ELSIF NEW.profile_id IS NOT NULL THEN
   SELECT project_id INTO NEW.project_id FROM public.marketing_project_profiles WHERE id=NEW.profile_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  ELSIF NEW.project_id IS NOT NULL THEN SELECT id INTO NEW.profile_id FROM public.marketing_project_profiles WHERE project_id=NEW.project_id; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_profile_identity BEFORE INSERT OR UPDATE ON public.marketing_project_profiles FOR EACH ROW EXECUTE FUNCTION public.marketing_profile_identity_guard();
CREATE TRIGGER marketing_capture_identity BEFORE INSERT OR UPDATE OF profile_id,project_id ON public.marketing_captures FOR EACH ROW EXECUTE FUNCTION public.marketing_profile_identity_guard();
CREATE OR REPLACE FUNCTION public.marketing_link_portfolio(_profile uuid,_project uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pm_projects WHERE id=_project) THEN RAISE EXCEPTION 'Live project not found'; END IF;
 UPDATE public.marketing_project_profiles SET project_id=_project WHERE id=_profile AND project_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Portfolio profile not found'; END IF;
 UPDATE public.marketing_captures SET project_id=_project WHERE profile_id=_profile;
END $$;
REVOKE ALL ON FUNCTION public.marketing_link_portfolio(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_link_portfolio(uuid,uuid) TO authenticated,service_role;
-- Retain the exact existing editorial guards while replacing only their identity joins.
DO $patch$
DECLARE r record; f text;
BEGIN
 FOR r IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('marketing_compute_draft_readiness','marketing_compute_asset_draft_readiness','marketing_effective_clearance','marketing_draft_library_project','marketing_draft_name_rule_violation','marketing_draft_warning_issue','marketing_source_clearance_changed','marketing_finish_reel','marketing_composition_slides_guard') LOOP
 f:=pg_get_functiondef(r.oid);
 f:=replace(f,'p.project_id=c.project_id','p.marketing_key=public.marketing_capture_key(c)');
 f:=replace(f,'p.project_id = c.project_id','p.marketing_key = public.marketing_capture_key(c)');
 f:=replace(f,'pr.name pname,pr.client pclient','coalesce(pr.name,p.internal_name) pname,coalesce(pr.client,p.internal_client) pclient');
 f:=replace(f,'coalesce(pr.name,p.project_id::text)','coalesce(pr.name,p.internal_name,p.marketing_key::text)');
 f:=replace(f,'p.clearance,p.name_rule,pr.name,pr.client','p.clearance,p.name_rule,coalesce(pr.name,p.internal_name),coalesce(pr.client,p.internal_client)');
 f:=replace(f,'WHERE p.project_id=_project_id','WHERE p.marketing_key=_project_id OR p.project_id=_project_id');
 f:=replace(f,'SELECT DISTINCT p.project_id FROM','SELECT DISTINCT p.marketing_key FROM');
 f:=replace(f,'p.project_id IS DISTINCT FROM _project_id','p.marketing_key IS DISTINCT FROM _project_id');
 f:=replace(f,'SELECT pr.project_id FROM','SELECT pr.marketing_key FROM');
 f:=replace(f,'AND project_id IN (d.project_id, lib)','AND marketing_key IN (d.project_id, lib)');
 f:=replace(f,'SELECT c.project_id FROM public.marketing_captures c WHERE c.id=ANY(d.capture_ids) AND c.project_id IS NOT NULL','SELECT public.marketing_capture_key(c) FROM public.marketing_captures c WHERE c.id=ANY(d.capture_ids) AND public.marketing_capture_key(c) IS NOT NULL');
 f:=replace(f,'d.project_id=NEW.project_id','d.project_id=NEW.marketing_key');
 f:=replace(f,'c.project_id=NEW.project_id','public.marketing_capture_key(c)=NEW.marketing_key');
 f:=replace(f,'ARRAY[r.id],p.project_id','ARRAY[r.id],p.marketing_key');
 f:=replace(f,'c.project_id = prof.project_id','public.marketing_capture_key(c) = prof.marketing_key');
 EXECUTE f;
 END LOOP;
END $patch$;
CREATE OR REPLACE VIEW public.marketing_draft_clearance_sources WITH (security_invoker=true) AS
WITH captures AS (
 SELECT DISTINCT d.id draft_id,c.id,public.marketing_capture_key(c) project_id,c.clearance,coalesce(c.ai_summary,left(c.raw_text,80),c.id::text) label
 FROM public.marketing_post_drafts d JOIN public.marketing_captures c ON c.id=ANY(d.capture_ids) OR EXISTS(SELECT 1 FROM public.marketing_capture_assets a WHERE a.capture_id=c.id AND a.id=ANY(d.asset_ids))
), projects AS (
 SELECT d.id draft_id,d.project_id FROM public.marketing_post_drafts d WHERE d.project_id IS NOT NULL
 UNION SELECT draft_id,project_id FROM captures WHERE project_id IS NOT NULL
 UNION SELECT d.id,p.marketing_key FROM public.marketing_post_drafts d JOIN public.marketing_project_media m ON m.id=ANY(d.asset_ids) JOIN public.marketing_project_profiles p ON p.id=m.profile_id
 UNION SELECT d.id,p.marketing_key FROM public.marketing_post_drafts d JOIN public.marketing_reel_uploads u ON u.id=ANY(d.asset_ids) JOIN public.marketing_project_profiles p ON p.id=u.profile_id
)
SELECT c.draft_id,'capture'::text kind,c.id source_id,c.label,c.clearance::text clearance,NULL::uuid profile_id,NULL::text flag,c.project_id IS NULL no_project,c.clearance<>'cleared' warning FROM captures c
UNION ALL SELECT c.draft_id,'flag',c.id,f.flag,NULL,NULL,f.flag,c.project_id IS NULL,true FROM captures c JOIN public.marketing_capture_active_flags a ON a.capture_id=c.id CROSS JOIN LATERAL unnest(a.active_flags) f(flag)
UNION ALL SELECT p.draft_id,'project',p.project_id,pr.name,coalesce(pp.clearance::text,'unknown'),pp.id,NULL,false,coalesce(pp.clearance::text,'unknown')<>'cleared' FROM projects p LEFT JOIN public.marketing_project_profiles pp ON pp.marketing_key=p.project_id LEFT JOIN public.marketing_project_directory pr ON pr.id=p.project_id;
CREATE TRIGGER marketing_capture_profile_refresh AFTER UPDATE OF profile_id ON public.marketing_captures FOR EACH ROW WHEN (OLD.profile_id IS DISTINCT FROM NEW.profile_id) EXECUTE FUNCTION public.marketing_source_clearance_changed();
COMMENT ON COLUMN public.marketing_project_profiles.marketing_key IS 'Stable Marketing-only identity. Existing keys equal live project IDs; portfolio keys survive optional live linkage.';
COMMENT ON COLUMN public.marketing_post_drafts.project_id IS 'Marketing identity key, not an operational foreign key; resolves marketing_project_profiles.marketing_key.';