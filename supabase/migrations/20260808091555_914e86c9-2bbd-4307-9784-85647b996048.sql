CREATE TABLE public.psa_proposal_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.psa_proposals(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.psa_proposal_snapshots(id) ON DELETE SET NULL,
  docusign_envelope_id text,
  status text NOT NULL DEFAULT 'sent',
  client_signer_name text,
  client_signer_email text,
  psa_signer_name text,
  psa_signer_email text,
  client_signed_at timestamptz,
  psa_signed_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status_note text,
  signed_pdf_storage_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT psa_proposal_signatures_status_chk CHECK (
    status IN ('sent','delivered','completed','declined','voided')
  )
);

CREATE INDEX idx_psa_proposal_signatures_proposal
  ON public.psa_proposal_signatures (proposal_id, created_at DESC);
CREATE INDEX idx_psa_proposal_signatures_snapshot
  ON public.psa_proposal_signatures (snapshot_id);
CREATE UNIQUE INDEX idx_psa_proposal_signatures_envelope
  ON public.psa_proposal_signatures (docusign_envelope_id)
  WHERE docusign_envelope_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.psa_proposal_signatures TO authenticated;
GRANT ALL ON public.psa_proposal_signatures TO service_role;

ALTER TABLE public.psa_proposal_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psa_proposal_signatures_read"
  ON public.psa_proposal_signatures FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text));

CREATE POLICY "psa_proposal_signatures_insert"
  ON public.psa_proposal_signatures FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text));

CREATE POLICY "psa_proposal_signatures_update"
  ON public.psa_proposal_signatures FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline'::text));

CREATE POLICY "psa_proposal_signatures_delete"
  ON public.psa_proposal_signatures FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_psa_proposal_signatures_updated_at
  BEFORE UPDATE ON public.psa_proposal_signatures
  FOR EACH ROW EXECUTE FUNCTION public.psa_set_updated_at();