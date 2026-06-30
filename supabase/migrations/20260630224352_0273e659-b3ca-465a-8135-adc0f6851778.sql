
CREATE TABLE public.psa_proposal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.psa_proposals(id) ON DELETE CASCADE,
  label text,
  reason text,
  snapshot jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX psa_proposal_snapshots_proposal_idx
  ON public.psa_proposal_snapshots (proposal_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.psa_proposal_snapshots TO authenticated;
GRANT ALL ON public.psa_proposal_snapshots TO service_role;

ALTER TABLE public.psa_proposal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read proposal snapshots"
  ON public.psa_proposal_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create proposal snapshots"
  ON public.psa_proposal_snapshots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete proposal snapshots"
  ON public.psa_proposal_snapshots FOR DELETE TO authenticated USING (true);
