
-- 1. Lock authority moves to fee_proposals (the quote), driven by quote_status
CREATE OR REPLACE FUNCTION public.fee_proposals_autolock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quote_status IN ('sent','approved','rejected') AND COALESCE(NEW.is_locked,false) = false THEN
    NEW.is_locked := true;
    NEW.locked_at := COALESCE(NEW.locked_at, now());
  END IF;
  IF NEW.pm_project_id IS NOT NULL THEN
    NEW.is_locked := true;
    NEW.locked_at := COALESCE(NEW.locked_at, now());
    NEW.locked_project_id := COALESCE(NEW.locked_project_id, NEW.pm_project_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Shared guard for every quote-owned planning table
CREATE OR REPLACE FUNCTION public.quote_child_guard_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  qid uuid;
  locked timestamptz;
  proj uuid;
BEGIN
  qid := COALESCE(NEW.quote_id, OLD.quote_id);
  IF qid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT locked_at, pm_project_id INTO locked, proj FROM public.fee_proposals WHERE id = qid;
  IF locked IS NOT NULL THEN
    IF proj IS NOT NULL THEN
      RAISE EXCEPTION 'QUOTE_LOCKED_CONVERTED' USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'QUOTE_LOCKED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quote_stages','quote_stage_dependencies','quote_allocations',
    'quote_external_services','quote_payment_schedule_items','quote_site_trips',
    'quote_supplier_markups','quote_stage_supplier_costs','quote_billable_hourly_rates',
    'quote_supplier_phase_splits'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname=t AND c.relkind='r') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_guard_locked ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_%I_guard_locked BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.quote_child_guard_locked()', t, t);
    END IF;
  END LOOP;
END $$;

-- 3. Proposal blocks now follow the quote's lock, not their own
CREATE OR REPLACE FUNCTION public.psa_proposal_blocks_guard_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  parent_id uuid;
  qid uuid;
  locked timestamptz;
  proj uuid;
BEGIN
  parent_id := COALESCE(NEW.proposal_id, OLD.proposal_id);
  SELECT quote_id INTO qid FROM public.psa_proposals WHERE id = parent_id;
  IF qid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT locked_at, pm_project_id INTO locked, proj FROM public.fee_proposals WHERE id = qid;
  IF locked IS NOT NULL THEN
    IF proj IS NOT NULL THEN
      RAISE EXCEPTION 'QUOTE_LOCKED_CONVERTED' USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'QUOTE_LOCKED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- retire the old, never-firing proposal-side lock trigger
DROP TRIGGER IF EXISTS trg_psa_proposals_lock_on_outcome ON public.psa_proposals;
CREATE OR REPLACE FUNCTION public.psa_proposals_lock_on_outcome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    NEW.outcome := 'won';
  ELSIF NEW.status = 'declined' AND (OLD.status IS DISTINCT FROM 'declined') THEN
    NEW.outcome := 'lost';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_psa_proposals_lock_on_outcome
BEFORE UPDATE ON public.psa_proposals
FOR EACH ROW EXECUTE FUNCTION public.psa_proposals_lock_on_outcome();

-- 4. Unlock for a new revision (never for a converted quote)
CREATE OR REPLACE FUNCTION public.quote_unlock_for_revision(_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE proj uuid;
BEGIN
  SELECT pm_project_id INTO proj FROM public.fee_proposals WHERE id = _quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF proj IS NOT NULL THEN
    RAISE EXCEPTION 'QUOTE_LOCKED_CONVERTED' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.fee_proposals
    SET is_locked = false, locked_at = NULL, quote_status = 'draft'
  WHERE id = _quote_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.quote_unlock_for_revision(uuid) TO authenticated;

-- 5. Restore-a-revision must clear the quote lock first, and refuse when converted
CREATE OR REPLACE FUNCTION public.psa_restore_revision(_snapshot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  snap record;
  prop record;
  p jsonb;
  raw jsonb;
  qid uuid;
  proj uuid;
  tbl text;
  tables text[] := ARRAY[
    'quote_stages','quote_external_services','quote_allocations','quote_stage_dependencies',
    'quote_supplier_markups','quote_stage_supplier_costs','quote_payment_schedule_items',
    'quote_site_trips','quote_billable_hourly_rates'
  ];
  payload jsonb;
BEGIN
  SELECT * INTO snap FROM public.psa_proposal_snapshots WHERE id = _snapshot_id;
  IF snap IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  SELECT * INTO prop FROM public.psa_proposals WHERE id = snap.proposal_id;
  IF prop IS NULL THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  p := snap.snapshot -> 'proposal';
  raw := snap.snapshot -> 'quote_data' -> 'raw';
  qid := prop.quote_id;

  IF qid IS NOT NULL THEN
    SELECT pm_project_id INTO proj FROM public.fee_proposals WHERE id = qid;
    IF proj IS NOT NULL THEN
      RAISE EXCEPTION 'QUOTE_LOCKED_CONVERTED' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.fee_proposals
      SET is_locked = false, locked_at = NULL, quote_status = 'draft'
    WHERE id = qid;
  END IF;

  IF prop.locked_at IS NOT NULL THEN
    UPDATE public.psa_proposals SET locked_at = NULL, status = 'draft' WHERE id = prop.id;
  END IF;

  IF p IS NOT NULL THEN
    UPDATE public.psa_proposals SET
      title = COALESCE(p ->> 'title', title),
      client_snapshot = COALESCE(p -> 'client_snapshot', client_snapshot),
      project_snapshot = COALESCE(p -> 'project_snapshot', project_snapshot),
      vat_mode = COALESCE(p ->> 'vat_mode', vat_mode),
      language = COALESCE(p ->> 'language', language),
      style_settings = COALESCE(p -> 'style_settings', style_settings),
      restored_from_snapshot_id = _snapshot_id,
      updated_at = now()
    WHERE id = prop.id;
  ELSE
    UPDATE public.psa_proposals
      SET restored_from_snapshot_id = _snapshot_id, updated_at = now()
    WHERE id = prop.id;
  END IF;

  DELETE FROM public.psa_proposal_blocks WHERE proposal_id = prop.id;
  INSERT INTO public.psa_proposal_blocks
  SELECT (jsonb_populate_record(
            null::public.psa_proposal_blocks,
            b || jsonb_build_object('proposal_id', prop.id)
          )).*
  FROM jsonb_array_elements(COALESCE(snap.snapshot -> 'blocks', '[]'::jsonb)) AS b;

  IF raw IS NOT NULL AND qid IS NOT NULL THEN
    FOREACH tbl IN ARRAY ARRAY[
      'quote_payment_schedule_items','quote_stage_supplier_costs','quote_supplier_markups',
      'quote_stage_dependencies','quote_allocations','quote_external_services',
      'quote_site_trips','quote_billable_hourly_rates','quote_stages'
    ] LOOP
      EXECUTE format('DELETE FROM public.%I WHERE quote_id = $1', tbl) USING qid;
    END LOOP;

    FOREACH tbl IN ARRAY tables LOOP
      payload := COALESCE(raw -> tbl, '[]'::jsonb);
      IF jsonb_typeof(payload) = 'array' AND jsonb_array_length(payload) > 0 THEN
        EXECUTE format(
          'INSERT INTO public.%I SELECT (jsonb_populate_record(null::public.%I, r || jsonb_build_object(''quote_id'', $1::text))).* '
          || 'FROM jsonb_array_elements($2) AS r', tbl, tbl)
        USING qid, payload;
      END IF;
    END LOOP;
  END IF;

  RETURN prop.id;
END;
$function$;
