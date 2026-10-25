-- Validate every function patched by 20261025112000; fail atomically on missing functions,
-- stale identity patterns, or missing expected Marketing-key joins.
DO $assert$
DECLARE r record; f text; old_pattern text; checked integer := 0;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('marketing_compute_draft_readiness(uuid[],text,text[],uuid)', 'p.marketing_key=public.marketing_capture_key(c)'),
 ('marketing_compute_asset_draft_readiness(uuid[],uuid[],uuid,text,text[])', 'SELECT DISTINCT p.marketing_key FROM'),
 ('marketing_effective_clearance(uuid)', 'p.marketing_key = public.marketing_capture_key(c)'),
 ('marketing_draft_library_project(uuid[],uuid[],uuid)', 'SELECT pr.marketing_key FROM'),
 ('marketing_draft_name_rule_violation(public.marketing_post_drafts)', 'AND marketing_key IN (d.project_id, lib)'),
 ('marketing_draft_warning_issue(public.marketing_post_drafts)', 'SELECT public.marketing_capture_key(c) FROM'),
 ('marketing_source_clearance_changed()', 'd.project_id=NEW.marketing_key'),
 ('marketing_finish_reel(uuid,text,text[],boolean)', 'ARRAY[r.id],p.marketing_key'),
 ('marketing_composition_slides_guard()', 'public.marketing_capture_key(c) = prof.marketing_key')
 ) x(signature,expected) LOOP
  IF to_regprocedure('public.' || r.signature) IS NULL THEN
   RAISE EXCEPTION 'Portfolio identity assertion: missing function %', r.signature;
  END IF;
  f := pg_get_functiondef(to_regprocedure('public.' || r.signature));
  FOREACH old_pattern IN ARRAY ARRAY[
   'p.project_id=c.project_id','p.project_id = c.project_id',
   'pr.name pname,pr.client pclient','coalesce(pr.name,p.project_id::text)',
   'p.clearance,p.name_rule,pr.name,pr.client','WHERE p.project_id=_project_id',
   'SELECT DISTINCT p.project_id FROM','p.project_id IS DISTINCT FROM _project_id',
   'SELECT pr.project_id FROM','AND project_id IN (d.project_id, lib)',
   'SELECT c.project_id FROM public.marketing_captures c WHERE c.id=ANY(d.capture_ids) AND c.project_id IS NOT NULL',
   'd.project_id=NEW.project_id','c.project_id=NEW.project_id','ARRAY[r.id],p.project_id',
   'c.project_id = prof.project_id'
  ] LOOP
   IF position(old_pattern IN f) > 0 THEN
    RAISE EXCEPTION 'Portfolio identity assertion: % retains old pattern %', r.signature, old_pattern;
   END IF;
  END LOOP;
  IF position(r.expected IN f) = 0 THEN
   RAISE EXCEPTION 'Portfolio identity assertion: % lacks expected pattern %', r.signature, r.expected;
  END IF;
  -- Also catch whitespace variations of the old capture/profile equality.
  IF f ~ 'p\.project_id\s*=\s*c\.project_id|c\.project_id\s*=\s*prof\.project_id' THEN
   RAISE EXCEPTION 'Portfolio identity assertion: % retains an operational capture/profile join', r.signature;
  END IF;
  checked := checked + 1;
 END LOOP;
 IF checked <> 9 THEN RAISE EXCEPTION 'Portfolio identity assertion: expected nine functions'; END IF;
END $assert$;
-- The directory already supplies portfolio names; an explicit profile fallback also
-- preserves the source label if a linked operational row is not visible under RLS.
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
UNION ALL SELECT p.draft_id,'project',p.project_id,coalesce(pr.name,pp.internal_name,p.project_id::text),coalesce(pp.clearance::text,'unknown'),pp.id,NULL,false,coalesce(pp.clearance::text,'unknown')<>'cleared' FROM projects p LEFT JOIN public.marketing_project_profiles pp ON pp.marketing_key=p.project_id LEFT JOIN public.marketing_project_directory pr ON pr.id=p.project_id;
GRANT SELECT ON public.marketing_draft_clearance_sources TO authenticated,service_role;