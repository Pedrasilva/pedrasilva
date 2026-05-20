
ALTER TABLE public.quote_proposal_document_blocks
  ADD COLUMN IF NOT EXISTS assembly_section_id text NULL,
  ADD COLUMN IF NOT EXISTS assembly_provenance jsonb NULL,
  ADD COLUMN IF NOT EXISTS assembly_locked text NULL;

ALTER TABLE public.quote_proposal_document_blocks
  DROP CONSTRAINT IF EXISTS qpdb_assembly_locked_check;
ALTER TABLE public.quote_proposal_document_blocks
  ADD CONSTRAINT qpdb_assembly_locked_check
  CHECK (assembly_locked IS NULL OR assembly_locked IN ('none','semi','full'));

CREATE INDEX IF NOT EXISTS idx_qpdb_assembly_section
  ON public.quote_proposal_document_blocks (proposal_document_id, assembly_section_id)
  WHERE assembly_section_id IS NOT NULL;
