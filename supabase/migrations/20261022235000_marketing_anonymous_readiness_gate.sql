-- Separate anonymity from clearance without changing existing drafts or permissions.
-- Replace only the blanket block in the current readiness function; preserve all other checks.
DO $migration$
DECLARE definition text; old_clause text := 'IF eff = ''internal_only'' OR r.name_rule = ''never_mention'' THEN internal := true; END IF;';
BEGIN
  definition := pg_get_functiondef('public.marketing_compute_draft_readiness(uuid[],text,text[],uuid)'::regprocedure);
  IF position(old_clause IN definition) = 0 THEN RAISE EXCEPTION 'Unexpected readiness definition; refusing to alter other checks'; END IF;
  EXECUTE replace(definition, old_clause, 'IF eff = ''internal_only'' THEN internal := true; END IF;');
END $migration$;

-- Gate the requested status before content-hash invalidation can demote it.
-- Pending and scheduled also recompute effective clearance from current records,
-- so a separate internal_only flag cannot be bypassed with stale readiness.
DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.marketing_post_drafts_approval_guard()'::regprocedure);
  IF position('BEGIN' IN definition) = 0 OR position('via_rpc boolean' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected approval guard definition; refusing to alter other checks';
  END IF;
  definition := replace(definition, 'via_rpc boolean', 'readiness_result record; via_rpc boolean');
  definition := replace(definition, E'BEGIN\n', E'BEGIN\n  IF NEW.status::text IN (''approved'',''pending_approval'',''scheduled'') THEN\n    why := public.marketing_draft_name_rule_violation(NEW);\n    IF why IS NOT NULL THEN RAISE EXCEPTION ''%'', why; END IF;\n    IF NEW.status::text IN (''pending_approval'',''scheduled'') THEN\n      SELECT * INTO readiness_result FROM public.marketing_compute_asset_draft_readiness(NEW.capture_ids, NEW.asset_ids, NEW.project_id,\n        coalesce(NEW.final_copy, NEW.ai_copy), coalesce(NEW.final_hashtags, NEW.ai_hashtags));\n      IF readiness_result.readiness <> ''ready'' THEN\n        RAISE EXCEPTION ''This draft is not ready: %'', coalesce(readiness_result.note, readiness_result.readiness::text);\n      END IF;\n    END IF;\n  END IF;\n');
  EXECUTE definition;
END $migration$;

COMMENT ON FUNCTION public.marketing_compute_draft_readiness(uuid[],text,text[],uuid) IS 'never_mention enforces anonymity, not internal-only clearance. Separate effective internal_only remains blocked.';
COMMENT ON FUNCTION public.marketing_post_drafts_approval_guard() IS 'Validates final caption, hashtags, story frames and location tag for approved/pending_approval/scheduled; retains content-hash invalidation and valid-approval scheduling requirements.';