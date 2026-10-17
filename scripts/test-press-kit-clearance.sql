-- Run against the project database in a transaction; all test edits roll back.
BEGIN;
DO $test$
DECLARE assets uuid[]; draft_id uuid := gen_random_uuid(); result record;
BEGIN
  SELECT array_agg(id) INTO assets FROM public.marketing_project_media
  WHERE profile_id = '997fd810-51f9-4bc4-8389-2c94af8a5820';
  IF coalesce(cardinality(assets), 0) = 0 THEN RAISE EXCEPTION 'Missing test library assets'; END IF;
  INSERT INTO public.marketing_post_drafts
    (id, request_id, idea_id, platform, capture_ids, asset_ids, ai_copy, rationale, readiness, bible_version, model)
  VALUES (draft_id, 'e78fe06b-2201-4e2e-a8ce-75c71086bfeb', gen_random_uuid(), 'instagram', '{}', assets,
    'Architecture', 'Verification only', 'ready', 1, 'verification');

  UPDATE public.marketing_project_profiles SET clearance = 'needs_client_approval'
  WHERE id = '997fd810-51f9-4bc4-8389-2c94af8a5820';
  SELECT * INTO result FROM public.marketing_compute_asset_draft_readiness('{}', assets, NULL, 'Architecture', '{}');
  IF result.readiness <> 'needs_approval' THEN RAISE EXCEPTION 'Client approval bypass'; END IF;
  BEGIN
    UPDATE public.marketing_post_drafts SET status = 'approved' WHERE id = draft_id;
    RAISE EXCEPTION 'Approval bypass';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'This draft can%approved:%' THEN RAISE; END IF;
  END;

  UPDATE public.marketing_project_profiles SET clearance = 'internal_only'
  WHERE id = '997fd810-51f9-4bc4-8389-2c94af8a5820';
  SELECT * INTO result FROM public.marketing_compute_asset_draft_readiness('{}', assets, NULL, 'Architecture', '{}');
  IF result.readiness <> 'blocked' THEN RAISE EXCEPTION 'Internal-only bypass'; END IF;

  UPDATE public.marketing_project_profiles SET clearance = 'cleared', name_rule = 'never_mention'
  WHERE id = '997fd810-51f9-4bc4-8389-2c94af8a5820';
  BEGIN
    UPDATE public.marketing_post_drafts SET status = 'approved' WHERE id = draft_id;
    RAISE EXCEPTION 'Never-name approval bypass';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'This draft can%approved:%' THEN RAISE; END IF;
  END;
END $test$;
SELECT 'Press-kit clearance assertions passed' AS result;
ROLLBACK;