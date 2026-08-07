ALTER TABLE public.psa_proposal_snapshots
  ADD COLUMN IF NOT EXISTS restored_from_snapshot_id uuid REFERENCES public.psa_proposal_snapshots(id) ON DELETE SET NULL;

ALTER TABLE public.psa_proposals
  ADD COLUMN IF NOT EXISTS restored_from_snapshot_id uuid REFERENCES public.psa_proposal_snapshots(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.psa_restore_revision(_snapshot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap record;
  prop record;
  p jsonb;
  raw jsonb;
  qid uuid;
  tbl text;
  tables text[] := ARRAY[
    'quote_stages',
    'quote_external_services',
    'quote_allocations',
    'quote_stage_dependencies',
    'quote_supplier_markups',
    'quote_stage_supplier_costs',
    'quote_payment_schedule_items',
    'quote_site_trips',
    'quote_billable_hourly_rates'
  ];
  del text[];
  payload jsonb;
BEGIN
  SELECT * INTO snap FROM public.psa_proposal_snapshots WHERE id = _snapshot_id;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'Revision not found';
  END IF;

  SELECT * INTO prop FROM public.psa_proposals WHERE id = snap.proposal_id;
  IF prop IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF prop.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Proposta bloqueada — não é possível restaurar revisões.';
  END IF;

  p := snap.snapshot -> 'proposal';
  raw := snap.snapshot -> 'quote_data' -> 'raw';
  qid := prop.quote_id;

  -- 1. Proposal content fields (never id/quote_id/status/locks/timestamps).
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

  -- 2. Blocks.
  DELETE FROM public.psa_proposal_blocks WHERE proposal_id = prop.id;
  INSERT INTO public.psa_proposal_blocks
  SELECT (jsonb_populate_record(
            null::public.psa_proposal_blocks,
            b || jsonb_build_object('proposal_id', prop.id)
          )).*
  FROM jsonb_array_elements(COALESCE(snap.snapshot -> 'blocks', '[]'::jsonb)) AS b;

  -- 3. Quote data (only when the revision carried raw rows).
  IF raw IS NOT NULL AND qid IS NOT NULL THEN
    del := ARRAY(SELECT unnest(tables) ORDER BY 1 DESC);
    -- delete children before parents
    FOREACH tbl IN ARRAY ARRAY[
      'quote_payment_schedule_items',
      'quote_stage_supplier_costs',
      'quote_supplier_markups',
      'quote_stage_dependencies',
      'quote_allocations',
      'quote_external_services',
      'quote_site_trips',
      'quote_billable_hourly_rates',
      'quote_stages'
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
$$;

REVOKE ALL ON FUNCTION public.psa_restore_revision(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.psa_restore_revision(uuid) TO authenticated;