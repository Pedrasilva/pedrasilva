-- Owner-authorized data correction, executed verbatim through the database data tool.
DO $correction$
DECLARE
  target constant uuid := '74d87598-1c32-4c90-8ed7-7bd510225b31';
  owner_id constant uuid := 'ab5a48c0-939b-4502-bd3b-db7801f0f8b8';
  reason constant text := 'approved by a test script by mistake; reverted at owner''s request';
  before_row public.marketing_post_drafts;
  after_row public.marketing_post_drafts;
  other_drafts jsonb;
  other_approvals jsonb;
  approval_ids jsonb;
  audit text;
BEGIN
  SELECT * INTO STRICT before_row FROM public.marketing_post_drafts WHERE id=target FOR UPDATE;
  IF before_row.status::text <> 'approved'
     OR before_row.decided_by IS DISTINCT FROM owner_id
     OR before_row.decided_at IS DISTINCT FROM '2026-10-24T18:43:30.398384Z'::timestamptz
     OR before_row.approved_content_hash IS DISTINCT FROM 'debd79c893cec7297445e9785bf494d4'
     OR public.marketing_draft_hash(before_row) IS DISTINCT FROM before_row.approved_content_hash
     OR before_row.scheduled_at IS NOT NULL OR before_row.publish_attempts <> 0
     OR before_row.publish_sent_at IS NOT NULL OR before_row.publish_lock_id IS NOT NULL
     OR before_row.ig_media_id IS NOT NULL OR before_row.ig_container_ids <> '[]'::jsonb
  THEN RAISE EXCEPTION 'Target no longer matches the owner-authorized reversal'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=owner_id AND role::text='admin')
  THEN RAISE EXCEPTION 'Recorded requesting owner is not an administrator'; END IF;
  SELECT jsonb_agg(to_jsonb(d) ORDER BY id) INTO other_drafts FROM public.marketing_post_drafts d WHERE id<>target;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY id) INTO other_approvals FROM public.marketing_post_approvals a WHERE draft_id<>target;
  SELECT jsonb_agg(id ORDER BY id) INTO approval_ids FROM public.marketing_post_approvals
    WHERE draft_id=target AND decision IN ('approved','pending') AND voided_at IS NULL;
  IF approval_ids IS NULL THEN RAISE EXCEPTION 'Expected live approval evidence missing'; END IF;
  audit := jsonb_build_object('event','approval_reverted','who',owner_id,'name','Luis Pedra Silva',
    'when',now(),'reason',reason,'approval_ids',approval_ids,
    'previous_decided_by',before_row.decided_by,'previous_decided_at',before_row.decided_at,
    'previous_approved_content_hash',before_row.approved_content_hash,
    'performed_via','owner-authorized scoped data correction')::text;
  UPDATE public.marketing_post_approvals
    SET comment=concat_ws(E'\n',nullif(comment,''),audit)
    WHERE draft_id=target AND decision IN ('approved','pending') AND voided_at IS NULL;
  -- Existing approval_sync voids approvals on return to suggested, preserving the records.
  UPDATE public.marketing_post_drafts
    SET status='suggested', approved_content_hash=NULL,
        decided_by=owner_id, decision_note=concat_ws(E'\n',nullif(decision_note,''),audit)
    WHERE id=target;
  SELECT * INTO STRICT after_row FROM public.marketing_post_drafts WHERE id=target;
  IF after_row.status::text <> 'suggested' OR after_row.approved_content_hash IS NOT NULL
     OR after_row.decided_by IS DISTINCT FROM owner_id OR after_row.decided_at IS DISTINCT FROM now()
     OR EXISTS (SELECT 1 FROM public.marketing_post_approvals WHERE draft_id=target AND decision IN ('approved','pending') AND voided_at IS NULL)
  THEN RAISE EXCEPTION 'Reversal evidence incomplete'; END IF;
  IF (to_jsonb(before_row)-ARRAY['status','approved_content_hash','decided_by','decided_at','decision_note'])
     IS DISTINCT FROM (to_jsonb(after_row)-ARRAY['status','approved_content_hash','decided_by','decided_at','decision_note'])
  THEN RAISE EXCEPTION 'An unapproved target field changed'; END IF;
  IF other_drafts IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.marketing_post_drafts d WHERE id<>target)
     OR other_approvals IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.marketing_post_approvals a WHERE draft_id<>target)
  THEN RAISE EXCEPTION 'An unrelated draft or approval changed'; END IF;
END
$correction$;