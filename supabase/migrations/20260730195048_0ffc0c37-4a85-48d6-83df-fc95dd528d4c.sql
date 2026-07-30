CREATE UNIQUE INDEX IF NOT EXISTS psa_proposal_snapshots_sent_rev_uniq
  ON public.psa_proposal_snapshots (proposal_id, rev_number)
  WHERE kind = 'sent';

CREATE OR REPLACE FUNCTION public.psa_next_rev_number(_proposal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next integer;
BEGIN
  PERFORM 1 FROM public.psa_proposals WHERE id = _proposal_id FOR UPDATE;
  SELECT COALESCE(MAX(rev_number), -1) + 1
    INTO _next
    FROM public.psa_proposal_snapshots
   WHERE proposal_id = _proposal_id
     AND kind = 'sent';
  RETURN COALESCE(_next, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.psa_next_rev_number(uuid) TO authenticated;