-- Multi-entity Stage 3: intake routing flags.
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS entity_conflict_ids uuid[],
  ADD COLUMN IF NOT EXISTS historical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purge_exempt boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.financial_document_review_queue.entity_conflict_ids IS 'Set when the document matched more than one of our entities ("Duas entidades"); a person decides. Row is filed under PSA Triagem.';
COMMENT ON COLUMN public.financial_document_review_queue.historical IS 'Moved in from history (e.g. Pedra Rioja documents before 2027-01-01); never auto-approved.';
COMMENT ON COLUMN public.financial_document_review_queue.purge_exempt IS 'Excluded from the automatic 30-day purge of removed items.';
CREATE INDEX IF NOT EXISTS fdrq_entity_conflict_idx ON public.financial_document_review_queue ((entity_conflict_ids IS NOT NULL)) WHERE entity_conflict_ids IS NOT NULL;