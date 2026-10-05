CREATE TABLE public.finance_other_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  nif text NOT NULL UNIQUE CHECK (nif = lower(btrim(nif)) AND nif <> ''),
  action text NOT NULL DEFAULT 'archive' CHECK (action IN ('archive','ignore','forward')),
  forward_email text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (action <> 'forward' OR (forward_email IS NOT NULL AND forward_email LIKE '%@%'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_other_entities TO authenticated;
GRANT ALL ON public.finance_other_entities TO service_role;
ALTER TABLE public.finance_other_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage other entities" ON public.finance_other_entities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));

ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS extracted_recipient_name text,
  ADD COLUMN IF NOT EXISTS extracted_recipient_vat text,
  ADD COLUMN IF NOT EXISTS other_entity_id uuid REFERENCES public.finance_other_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS other_entity_action text,
  ADD COLUMN IF NOT EXISTS forwarded_to text,
  ADD COLUMN IF NOT EXISTS forwarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS forward_error text;

ALTER TABLE public.financial_document_review_queue DROP CONSTRAINT IF EXISTS fdrq_intake_type_chk;
ALTER TABLE public.financial_document_review_queue ADD CONSTRAINT fdrq_intake_type_chk CHECK (intake_type IS NULL OR intake_type IN (
  'fatura_compra','nota_credito','recibo','comprovativo_pagamento','extrato_bancario',
  'nota_lancamento','fatura_emitida','documento_fiscal','contrato_outro','nao_financeiro','desconhecido','outra_entidade'));
ALTER TABLE public.financial_document_review_queue DROP CONSTRAINT IF EXISTS fdrq_intake_route_chk;
ALTER TABLE public.financial_document_review_queue ADD CONSTRAINT fdrq_intake_route_chk CHECK (intake_route IS NULL OR intake_route IN (
  'triage','purchases','payments','bank','issued','other','ignored','retry','other_entity'));

ALTER TABLE public.finance_intake_instructions DROP CONSTRAINT IF EXISTS finance_intake_instructions_scope_type_check;
ALTER TABLE public.finance_intake_instructions ADD CONSTRAINT finance_intake_instructions_scope_type_check
  CHECK (scope_type IN ('global','supplier_nif','sender','recipient_nif','document'));