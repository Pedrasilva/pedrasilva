
-- 1) Soft delete columns
ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS fee_proposals_deleted_at_idx ON public.fee_proposals(deleted_at);

-- 2) Audit log table
CREATE TABLE IF NOT EXISTS public.fee_proposal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL,
  opportunity_id UUID,
  action TEXT NOT NULL CHECK (action IN ('archive','unarchive','soft_delete','restore','hard_purge')),
  actor UUID REFERENCES auth.users(id),
  snapshot JSONB NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_proposal_audit_log_proposal_id_idx ON public.fee_proposal_audit_log(proposal_id);
CREATE INDEX IF NOT EXISTS fee_proposal_audit_log_created_at_idx ON public.fee_proposal_audit_log(created_at DESC);

GRANT SELECT, INSERT ON public.fee_proposal_audit_log TO authenticated;
GRANT ALL ON public.fee_proposal_audit_log TO service_role;

ALTER TABLE public.fee_proposal_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.fee_proposal_audit_log;
CREATE POLICY "Admins read audit log"
ON public.fee_proposal_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated write audit log" ON public.fee_proposal_audit_log;
CREATE POLICY "Authenticated write audit log"
ON public.fee_proposal_audit_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 3) Snapshot helper (security definer - reads everything related to a proposal)
CREATE OR REPLACE FUNCTION public.build_fee_proposal_snapshot(_proposal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap JSONB;
BEGIN
  SELECT jsonb_build_object(
    'proposal', (SELECT to_jsonb(p) FROM public.fee_proposals p WHERE p.id = _proposal_id),
    'quote_stages', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stages t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_allocations', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_allocations t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_external_services', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_external_services t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_payment_schedule_items', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_payment_schedule_items t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_stage_dependencies', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stage_dependencies t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_supplier_phase_splits', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_supplier_phase_splits t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_stage_supplier_costs', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_stage_supplier_costs t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_proposal_documents', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_proposal_documents t WHERE t.quote_id = _proposal_id), '[]'::jsonb),
    'quote_proposal_document_blocks', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.quote_proposal_document_blocks t
       WHERE t.document_id IN (SELECT id FROM public.quote_proposal_documents WHERE quote_id = _proposal_id)), '[]'::jsonb)
  )
  INTO snap;
  RETURN snap;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_fee_proposal_snapshot(UUID) TO authenticated, service_role;

-- 4) Soft delete RPC
CREATE OR REPLACE FUNCTION public.soft_delete_fee_proposal(_proposal_id UUID, _note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked BOOLEAN;
  v_opp UUID;
  v_snap JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_fee_proposal(UUID, TEXT) TO authenticated;

-- 5) Restore (admin only)
CREATE OR REPLACE FUNCTION public.restore_fee_proposal(_proposal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT opportunity_id INTO v_opp FROM public.fee_proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  UPDATE public.fee_proposals
     SET deleted_at = NULL, deleted_by = NULL
   WHERE id = _proposal_id;

  INSERT INTO public.fee_proposal_audit_log(proposal_id, opportunity_id, action, actor, snapshot)
  VALUES (_proposal_id, v_opp, 'restore', auth.uid(), public.build_fee_proposal_snapshot(_proposal_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_fee_proposal(UUID) TO authenticated;

-- 6) Hard purge (admin only) — snapshot is preserved in audit log forever
CREATE OR REPLACE FUNCTION public.hard_purge_fee_proposal(_proposal_id UUID, _note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp UUID;
  v_snap JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT opportunity_id INTO v_opp FROM public.fee_proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  v_snap := public.build_fee_proposal_snapshot(_proposal_id);

  INSERT INTO public.fee_proposal_audit_log(proposal_id, opportunity_id, action, actor, snapshot, note)
  VALUES (_proposal_id, v_opp, 'hard_purge', auth.uid(), v_snap, _note);

  DELETE FROM public.fee_proposals WHERE id = _proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hard_purge_fee_proposal(UUID, TEXT) TO authenticated;

-- 7) Audit archive/unarchive too (trigger)
CREATE OR REPLACE FUNCTION public.fee_proposals_archive_audit_trg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.archived_at IS NULL) AND (NEW.archived_at IS NOT NULL) THEN
    INSERT INTO public.fee_proposal_audit_log(proposal_id, opportunity_id, action, actor, snapshot)
    VALUES (NEW.id, NEW.opportunity_id, 'archive', auth.uid(), public.build_fee_proposal_snapshot(NEW.id));
  ELSIF (OLD.archived_at IS NOT NULL) AND (NEW.archived_at IS NULL) THEN
    INSERT INTO public.fee_proposal_audit_log(proposal_id, opportunity_id, action, actor, snapshot)
    VALUES (NEW.id, NEW.opportunity_id, 'unarchive', auth.uid(), public.build_fee_proposal_snapshot(NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_proposals_archive_audit_trg ON public.fee_proposals;
CREATE TRIGGER fee_proposals_archive_audit_trg
AFTER UPDATE OF archived_at ON public.fee_proposals
FOR EACH ROW EXECUTE FUNCTION public.fee_proposals_archive_audit_trg();
