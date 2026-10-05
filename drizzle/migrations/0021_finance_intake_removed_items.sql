ALTER TYPE public.fdrq_status ADD VALUE IF NOT EXISTS 'removed';
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by uuid,
  ADD COLUMN IF NOT EXISTS removed_source text,
  ADD COLUMN IF NOT EXISTS removed_reason text,
  ADD COLUMN IF NOT EXISTS removed_tag text,
  ADD COLUMN IF NOT EXISTS removed_prev_status text,
  ADD COLUMN IF NOT EXISTS keep_despite_recipient boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS fdrq_removed_at_idx ON public.financial_document_review_queue (removed_at) WHERE removed_at IS NOT NULL;
ALTER TABLE public.pm_invoice_settings
  ADD COLUMN IF NOT EXISTS company_name_variants text[] NOT NULL DEFAULT ARRAY['Pedra Silva Arquitecto','Pedra Silva Arquitectos','Pedra Silva Architects','Pedra Silva Arq.']::text[];
ALTER TABLE public.finance_intake_instructions
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'note';
ALTER TABLE public.finance_intake_instructions
  ADD CONSTRAINT finance_intake_instructions_action_check CHECK (action IN ('note','remove'));
ALTER TABLE public.finance_intake_instructions DROP CONSTRAINT finance_intake_instructions_scope_type_check;
ALTER TABLE public.finance_intake_instructions ADD CONSTRAINT finance_intake_instructions_scope_type_check
  CHECK (scope_type = ANY (ARRAY['global','supplier_nif','sender','sender_domain','recipient_nif','document']));
ALTER TABLE public.finance_intake_corrections DROP CONSTRAINT finance_intake_corrections_field_check;
ALTER TABLE public.finance_intake_corrections ADD CONSTRAINT finance_intake_corrections_field_check
  CHECK (field = ANY (ARRAY['intake_type','classification_code','removal']));
COMMENT ON TABLE public.finance_other_entities IS 'DEPRECATED: replaced by the PSA-only recipient rule (removed items)';