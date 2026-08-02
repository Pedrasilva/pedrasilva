-- 1. clone_fee_proposal_as_revision: guard via wrapper, keep implementation intact
ALTER FUNCTION public.clone_fee_proposal_as_revision(uuid)
  RENAME TO clone_fee_proposal_as_revision_impl;

REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision_impl(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision_impl(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision_impl(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.clone_fee_proposal_as_revision(p_source uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_permission(auth.uid(), 'crm.pipeline')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.clone_fee_proposal_as_revision_impl(p_source);
END;
$function$;

REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_fee_proposal_as_revision(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clone_fee_proposal_as_revision(uuid) TO authenticated;

-- 2. soft_delete_fee_proposal: require admin or crm.pipeline
CREATE OR REPLACE FUNCTION public.soft_delete_fee_proposal(_proposal_id uuid, _note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_locked BOOLEAN;
  v_opp UUID;
  v_snap JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_permission(auth.uid(), 'crm.pipeline')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT is_locked, opportunity_id INTO v_locked, v_opp
  FROM public.fee_proposals WHERE id = _proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;
  IF v_locked THEN
    RAISE EXCEPTION 'Cannot delete a locked proposal';
  END IF;

  v_snap := public.build_fee_proposal_snapshot(_proposal_id);

  INSERT INTO public.fee_proposal_audit_log(proposal_id, opportunity_id, action, actor, snapshot, note)
  VALUES (_proposal_id, v_opp, 'soft_delete', auth.uid(), v_snap, _note);

  UPDATE public.fee_proposals
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = _proposal_id;
END;
$function$;

-- 3. set_snapshot_in_force: admin only
CREATE OR REPLACE FUNCTION public.set_snapshot_in_force(p_snapshot_id uuid, p_from date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_collab uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT collaborator_id INTO v_collab
  FROM public.salary_snapshots
  WHERE id = p_snapshot_id;

  IF v_collab IS NULL THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;

  UPDATE public.salary_snapshots
  SET is_effective = false,
      effective_to = COALESCE(effective_to, (p_from - INTERVAL '1 day')::date),
      updated_at = now()
  WHERE collaborator_id = v_collab
    AND id <> p_snapshot_id
    AND is_effective = true;

  UPDATE public.salary_snapshots
  SET is_effective = true,
      effective_from = p_from,
      effective_to = NULL,
      archived_at = NULL,
      updated_at = now()
  WHERE id = p_snapshot_id;
END;
$function$;