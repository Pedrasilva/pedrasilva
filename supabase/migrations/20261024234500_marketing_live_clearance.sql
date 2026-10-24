CREATE TABLE public.marketing_capture_flag_dismissals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), capture_id uuid NOT NULL REFERENCES public.marketing_captures(id),
 flag text NOT NULL, reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
 dismissed_by uuid NOT NULL, dismissed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(capture_id,flag)
);
GRANT SELECT ON public.marketing_capture_flag_dismissals TO authenticated;
GRANT ALL ON public.marketing_capture_flag_dismissals TO service_role;
REVOKE ALL ON public.marketing_capture_flag_dismissals FROM anon;
REVOKE TRUNCATE ON public.marketing_capture_flag_dismissals FROM anon,authenticated;
ALTER TABLE public.marketing_capture_flag_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY dismissal_read ON public.marketing_capture_flag_dismissals FOR SELECT TO authenticated USING(public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE FUNCTION public.marketing_flag_dismissal_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Flag dismissal history is append-only'; END $$;
CREATE TRIGGER marketing_flag_dismissal_immutable BEFORE UPDATE OR DELETE ON public.marketing_capture_flag_dismissals FOR EACH ROW EXECUTE FUNCTION public.marketing_flag_dismissal_immutable();
CREATE FUNCTION public.marketing_active_capture_flags(_capture uuid) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(array_agg(f.flag),'{}') FROM public.marketing_captures c CROSS JOIN LATERAL unnest(c.ai_flags) f(flag)
 WHERE c.id=_capture AND NOT EXISTS(SELECT 1 FROM public.marketing_capture_flag_dismissals x WHERE x.capture_id=c.id AND x.flag=f.flag);
$$;
REVOKE ALL ON FUNCTION public.marketing_active_capture_flags(uuid) FROM PUBLIC,anon,authenticated;
CREATE VIEW public.marketing_capture_active_flags WITH (security_invoker=true) AS
 SELECT c.id capture_id,coalesce(array_agg(f.flag) FILTER(WHERE f.flag IS NOT NULL AND x.id IS NULL),'{}') active_flags
 FROM public.marketing_captures c LEFT JOIN LATERAL unnest(c.ai_flags) f(flag) ON true
 LEFT JOIN public.marketing_capture_flag_dismissals x ON x.capture_id=c.id AND x.flag=f.flag GROUP BY c.id;
GRANT SELECT ON public.marketing_capture_active_flags TO authenticated,service_role;
CREATE VIEW public.marketing_draft_clearance_sources WITH (security_invoker=true) AS
 WITH captures AS (
 SELECT DISTINCT d.id draft_id,c.id,c.project_id,c.clearance,coalesce(c.ai_summary,left(c.raw_text,80),c.id::text) label
 FROM public.marketing_post_drafts d JOIN public.marketing_captures c ON c.id=ANY(d.capture_ids)
 OR EXISTS(SELECT 1 FROM public.marketing_capture_assets a WHERE a.capture_id=c.id AND a.id=ANY(d.asset_ids))
 ), projects AS (
 SELECT d.id draft_id,d.project_id FROM public.marketing_post_drafts d WHERE d.project_id IS NOT NULL
 UNION SELECT draft_id,project_id FROM captures WHERE project_id IS NOT NULL
 UNION SELECT d.id,p.project_id FROM public.marketing_post_drafts d JOIN public.marketing_project_media m ON m.id=ANY(d.asset_ids) JOIN public.marketing_project_profiles p ON p.id=m.profile_id
 )
 SELECT c.draft_id,'capture'::text kind,c.id source_id,c.label,c.clearance::text clearance,NULL::uuid profile_id,NULL::text flag,c.project_id IS NULL no_project,c.clearance<>'cleared' warning FROM captures c
 UNION ALL SELECT c.draft_id,'flag',c.id,f.flag,NULL,NULL,f.flag,c.project_id IS NULL,true FROM captures c JOIN public.marketing_capture_active_flags a ON a.capture_id=c.id CROSS JOIN LATERAL unnest(a.active_flags) f(flag)
 UNION ALL SELECT p.draft_id,'project',p.project_id,pr.name,coalesce(pp.clearance::text,'unknown'),pp.id,NULL,false,coalesce(pp.clearance::text,'unknown')<>'cleared' FROM projects p LEFT JOIN public.marketing_project_profiles pp ON pp.project_id=p.project_id LEFT JOIN public.pm_projects pr ON pr.id=p.project_id;
GRANT SELECT ON public.marketing_draft_clearance_sources TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.marketing_compute_draft_readiness(_capture_ids uuid[],_copy text,_hashtags text[],_project_id uuid DEFAULT NULL,OUT readiness public.marketing_draft_readiness,OUT note text,OUT flags text[])
 RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE hay text:=lower(coalesce(_copy,'')||' '||coalesce(array_to_string(_hashtags,' '),'')); r record; named boolean:=false; internal boolean:=false; pending text[]:='{}'; eff public.marketing_clearance;
BEGIN
 flags:='{}';
 FOR r IN SELECT c.clearance own,public.marketing_active_capture_flags(c.id) ai_flags,coalesce(left(c.ai_summary,80),left(c.raw_text,80),c.id::text) label,p.clearance proj,p.name_rule,pr.name pname,pr.client pclient
 FROM public.marketing_captures c LEFT JOIN public.marketing_project_profiles p ON p.project_id=c.project_id LEFT JOIN public.pm_projects pr ON pr.id=c.project_id WHERE c.id=ANY(coalesce(_capture_ids,'{}'))
 UNION ALL SELECT NULL::public.marketing_clearance,'{}'::text[],'Project: '||coalesce(pr.name,p.project_id::text),p.clearance,p.name_rule,pr.name,pr.client FROM public.marketing_project_profiles p LEFT JOIN public.pm_projects pr ON pr.id=p.project_id WHERE p.project_id=_project_id
 LOOP
 SELECT x.cl INTO eff FROM (VALUES(r.own),(r.proj)) x(cl) WHERE x.cl IS NOT NULL ORDER BY CASE x.cl WHEN 'internal_only' THEN 0 WHEN 'needs_client_approval' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END LIMIT 1;
 IF eff='internal_only' THEN internal:=true; END IF;
 IF r.name_rule IS NOT NULL AND r.name_rule<>'name' AND ((length(trim(coalesce(r.pclient,'')))>=3 AND position(lower(trim(r.pclient)) IN hay)>0) OR (length(trim(coalesce(r.pname,'')))>=3 AND position(lower(trim(r.pname)) IN hay)>0)) THEN named:=true; END IF;
 IF eff IS DISTINCT FROM 'cleared' THEN pending:=pending||(r.label||' ('||coalesce(eff::text,'unknown')||')'); END IF;
 IF cardinality(r.ai_flags)>0 THEN pending:=pending||(r.label||': '||array_to_string(r.ai_flags,', ')); flags:=flags||r.ai_flags; END IF;
 END LOOP;
 IF named THEN flags:=flags||'Names a client that must not be named'::text; END IF;
 IF internal THEN flags:=flags||'Uses internal-only material'::text; END IF;
 IF named OR internal THEN readiness:='blocked'; note:=array_to_string(flags,'; ');
 ELSIF cardinality(pending)=0 THEN readiness:='ready';note:=NULL;
 ELSE readiness:='needs_approval';note:='Clearance warning: '||array_to_string(pending,'; '); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.marketing_compute_asset_draft_readiness(_capture_ids uuid[],_asset_ids uuid[],_project_id uuid,_copy text,_hashtags text[],OUT readiness public.marketing_draft_readiness,OUT note text,OUT flags text[])
 RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE res record; pid uuid; cids uuid[];
BEGIN
 SELECT coalesce(array_agg(DISTINCT id),'{}') INTO cids FROM (SELECT unnest(coalesce(_capture_ids,'{}')) id UNION SELECT capture_id FROM public.marketing_capture_assets WHERE id=ANY(coalesce(_asset_ids,'{}'))) c;
 SELECT * INTO res FROM public.marketing_compute_draft_readiness(cids,_copy,_hashtags,_project_id);readiness:=res.readiness;note:=res.note;flags:=res.flags;
 FOR pid IN SELECT DISTINCT p.project_id FROM public.marketing_project_media m JOIN public.marketing_project_profiles p ON p.id=m.profile_id WHERE m.id=ANY(coalesce(_asset_ids,'{}')) AND p.project_id IS DISTINCT FROM _project_id LOOP
 SELECT * INTO res FROM public.marketing_compute_draft_readiness('{}',_copy,_hashtags,pid);
 IF res.readiness='blocked' OR (res.readiness='needs_approval' AND readiness='ready') THEN readiness:=res.readiness;END IF;
 note:=nullif(concat_ws('; ',note,res.note),'');flags:=flags||res.flags;
 END LOOP;
END $$;
CREATE FUNCTION public.marketing_refresh_clearance(_ids uuid[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; previous text:=coalesce(current_setting('marketing.readiness_recheck',true),'off');
BEGIN
 PERFORM set_config('marketing.readiness_recheck','on',true);
 UPDATE public.marketing_post_drafts d SET readiness=r.readiness,readiness_note=r.note,safety_flags=r.flags
 FROM (SELECT x.id,c.* FROM public.marketing_post_drafts x CROSS JOIN LATERAL public.marketing_compute_asset_draft_readiness(x.capture_ids,x.asset_ids,x.project_id,coalesce(x.final_copy,x.ai_copy),coalesce(x.final_hashtags,x.ai_hashtags)) c WHERE x.id=ANY(_ids) AND x.status IN ('suggested','pending_approval','approved','scheduled','failed')) r
 WHERE d.id=r.id AND d.status IN ('suggested','pending_approval','approved','scheduled','failed') AND (d.readiness,d.readiness_note,d.safety_flags) IS DISTINCT FROM (r.readiness,r.note,r.flags);
 GET DIAGNOSTICS n=ROW_COUNT;PERFORM set_config('marketing.readiness_recheck',previous,true);RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.marketing_refresh_clearance(uuid[]) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.marketing_recheck_drafts(_ids uuid[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Not allowed to recheck drafts'; END IF;
 RETURN public.marketing_refresh_clearance(_ids);
END $$;
REVOKE ALL ON FUNCTION public.marketing_recheck_drafts(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_recheck_drafts(uuid[]) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.marketing_recheck_draft_readiness(_draft_id uuid) RETURNS public.marketing_draft_readiness LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.marketing_draft_readiness;BEGIN
 PERFORM public.marketing_recheck_drafts(ARRAY[_draft_id]);SELECT readiness INTO result FROM public.marketing_post_drafts WHERE id=_draft_id;IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found';END IF;RETURN result;
END $$;
CREATE FUNCTION public.marketing_source_clearance_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[];BEGIN
 IF TG_TABLE_NAME='marketing_captures' THEN
 SELECT array_agg(DISTINCT d.id) INTO ids FROM public.marketing_post_drafts d WHERE NEW.id=ANY(d.capture_ids) OR EXISTS(SELECT 1 FROM public.marketing_capture_assets a WHERE a.capture_id=NEW.id AND a.id=ANY(d.asset_ids));
 ELSE
 SELECT array_agg(DISTINCT d.id) INTO ids FROM public.marketing_post_drafts d WHERE d.project_id=NEW.project_id OR EXISTS(SELECT 1 FROM public.marketing_captures c WHERE c.project_id=NEW.project_id AND (c.id=ANY(d.capture_ids) OR EXISTS(SELECT 1 FROM public.marketing_capture_assets a WHERE a.capture_id=c.id AND a.id=ANY(d.asset_ids)))) OR EXISTS(SELECT 1 FROM public.marketing_project_media m WHERE m.profile_id=NEW.id AND m.id=ANY(d.asset_ids));
 END IF;
 PERFORM public.marketing_refresh_clearance(coalesce(ids,'{}'));RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.marketing_source_clearance_changed() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER marketing_capture_clearance_refresh AFTER UPDATE OF clearance,ai_flags,project_id ON public.marketing_captures FOR EACH ROW WHEN ((OLD.clearance,OLD.ai_flags,OLD.project_id) IS DISTINCT FROM (NEW.clearance,NEW.ai_flags,NEW.project_id)) EXECUTE FUNCTION public.marketing_source_clearance_changed();
CREATE TRIGGER marketing_profile_clearance_refresh AFTER INSERT OR UPDATE OF clearance,name_rule ON public.marketing_project_profiles FOR EACH ROW EXECUTE FUNCTION public.marketing_source_clearance_changed();
CREATE FUNCTION public.marketing_dismiss_capture_flag(_capture uuid,_flag text,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;ids uuid[];BEGIN
 IF auth.uid() IS NULL OR NOT public.has_module_permission(auth.uid(),'marketing.curate','all') THEN RAISE EXCEPTION 'Only curators can dismiss AI flags';END IF;
 IF length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'A short reason is required (3–500 characters)';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_captures WHERE id=_capture AND _flag=ANY(ai_flags)) THEN RAISE EXCEPTION 'Capture flag not found';END IF;
 INSERT INTO public.marketing_capture_flag_dismissals(capture_id,flag,reason,dismissed_by) VALUES(_capture,_flag,btrim(_reason),auth.uid()) ON CONFLICT(capture_id,flag) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.marketing_capture_flag_dismissals WHERE capture_id=_capture AND flag=_flag;END IF;
 SELECT array_agg(DISTINCT d.id) INTO ids FROM public.marketing_post_drafts d WHERE _capture=ANY(d.capture_ids) OR EXISTS(SELECT 1 FROM public.marketing_capture_assets a WHERE a.capture_id=_capture AND a.id=ANY(d.asset_ids));
 PERFORM public.marketing_refresh_clearance(coalesce(ids,'{}'));RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.marketing_dismiss_capture_flag(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_dismiss_capture_flag(uuid,text,text) TO authenticated;
COMMENT ON TABLE public.marketing_capture_flag_dismissals IS 'Append-only curator decisions; original capture ai_flags are never edited by dismissal. Readiness metadata is outside the canonical approval hash.';