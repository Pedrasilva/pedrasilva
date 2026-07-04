
-- 1. Extend the snapshot table with revision + PDF metadata.
ALTER TABLE public.psa_proposal_snapshots
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS rev_number integer,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_filename text,
  ADD COLUMN IF NOT EXISTS pdf_mime text;

ALTER TABLE public.psa_proposal_snapshots
  DROP CONSTRAINT IF EXISTS psa_proposal_snapshots_kind_chk;
ALTER TABLE public.psa_proposal_snapshots
  ADD CONSTRAINT psa_proposal_snapshots_kind_chk
  CHECK (kind IN ('auto','sent','pre-restore','manual'));

CREATE UNIQUE INDEX IF NOT EXISTS psa_proposal_snapshots_rev_uidx
  ON public.psa_proposal_snapshots (proposal_id, rev_number)
  WHERE rev_number IS NOT NULL;

-- 2. Add lock + outcome to proposals.
ALTER TABLE public.psa_proposals
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.psa_proposals
  DROP CONSTRAINT IF EXISTS psa_proposals_outcome_chk;
ALTER TABLE public.psa_proposals
  ADD CONSTRAINT psa_proposals_outcome_chk
  CHECK (outcome IS NULL OR outcome IN ('won','lost'));

-- 3. Trigger: when status transitions to accepted/declined, stamp locked_at + outcome.
CREATE OR REPLACE FUNCTION public.psa_proposals_lock_on_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    NEW.outcome := 'won';
    IF NEW.locked_at IS NULL THEN NEW.locked_at := now(); END IF;
  ELSIF NEW.status = 'declined' AND (OLD.status IS DISTINCT FROM 'declined') THEN
    NEW.outcome := 'lost';
    IF NEW.locked_at IS NULL THEN NEW.locked_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_psa_proposals_lock_on_outcome ON public.psa_proposals;
CREATE TRIGGER trg_psa_proposals_lock_on_outcome
  BEFORE UPDATE ON public.psa_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.psa_proposals_lock_on_outcome();

-- 4. Guard block-content writes when parent is locked.
CREATE OR REPLACE FUNCTION public.psa_proposal_blocks_guard_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_locked timestamptz;
  parent_id uuid;
BEGIN
  parent_id := COALESCE(NEW.proposal_id, OLD.proposal_id);
  SELECT locked_at INTO parent_locked FROM public.psa_proposals WHERE id = parent_id;
  IF parent_locked IS NOT NULL THEN
    RAISE EXCEPTION 'Proposta bloqueada — não é possível editar blocos'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_psa_proposal_blocks_guard_locked ON public.psa_proposal_blocks;
CREATE TRIGGER trg_psa_proposal_blocks_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.psa_proposal_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.psa_proposal_blocks_guard_locked();

-- 5. Backfill existing snapshot rows.
UPDATE public.psa_proposal_snapshots SET kind = 'auto' WHERE kind IS NULL;
