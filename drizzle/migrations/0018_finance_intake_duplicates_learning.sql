ALTER TYPE public.fdrq_status ADD VALUE IF NOT EXISTS 'duplicate';

ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS file_sha256 text,
  ADD COLUMN IF NOT EXISTS sender_address text,
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES public.financial_document_review_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_of_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_kind text,
  ADD COLUMN IF NOT EXISTS duplicate_reason text,
  ADD COLUMN IF NOT EXISTS possible_duplicates jsonb,
  ADD COLUMN IF NOT EXISTS possible_duplicate_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_learning jsonb,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS fdrq_file_sha256_idx ON public.financial_document_review_queue(file_sha256) WHERE file_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS fdrq_supplier_vat_idx ON public.financial_document_review_queue(extracted_supplier_vat);

-- Pair decisions for "Possível duplicado" (ordered pair, so each pair is remembered once).
CREATE TABLE public.finance_duplicate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_a uuid NOT NULL,
  item_b uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('duplicate','not_duplicate')),
  decided_by uuid DEFAULT auth.uid(),
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_a, item_b),
  CHECK (item_a < item_b)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_duplicate_decisions TO authenticated;
GRANT ALL ON public.finance_duplicate_decisions TO service_role;
ALTER TABLE public.finance_duplicate_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage duplicate decisions" ON public.finance_duplicate_decisions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));

-- Studio instructions given to the reader ("Regras do estúdio").
CREATE TABLE public.finance_intake_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL CHECK (length(btrim(text)) > 0 AND length(text) <= 2000),
  scope_type text NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global','supplier_nif','sender')),
  scope_value text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'global' AND scope_value IS NULL) OR (scope_type <> 'global' AND scope_value IS NOT NULL AND scope_value = lower(btrim(scope_value)) AND scope_value <> ''))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_intake_instructions TO authenticated;
GRANT ALL ON public.finance_intake_instructions TO service_role;
ALTER TABLE public.finance_intake_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage intake instructions" ON public.finance_intake_instructions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));

-- Human corrections of type / classification (no document contents).
CREATE TABLE public.finance_intake_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id uuid REFERENCES public.financial_document_review_queue(id) ON DELETE SET NULL,
  supplier_nif text,
  field text NOT NULL CHECK (field IN ('intake_type','classification_code')),
  ai_value text,
  corrected_value text,
  corrected_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_intake_corrections_nif_idx ON public.finance_intake_corrections(supplier_nif, created_at DESC);
GRANT SELECT, INSERT ON public.finance_intake_corrections TO authenticated;
GRANT ALL ON public.finance_intake_corrections TO service_role;
ALTER TABLE public.finance_intake_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users read corrections" ON public.finance_intake_corrections
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));
CREATE POLICY "Finance users add corrections" ON public.finance_intake_corrections
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));

-- Log of intake clean-up deletions (counts and ids only, no contents).
CREATE TABLE public.finance_intake_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_count integer NOT NULL,
  criteria jsonb NOT NULL,
  deleted_items jsonb NOT NULL,
  deleted_by uuid,
  deleted_by_label text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_intake_deletion_log TO authenticated;
GRANT ALL ON public.finance_intake_deletion_log TO service_role;
ALTER TABLE public.finance_intake_deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read intake deletion log" ON public.finance_intake_deletion_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));