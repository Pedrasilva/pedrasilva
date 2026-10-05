ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS intake_type text,
  ADD COLUMN IF NOT EXISTS intake_type_confidence numeric,
  ADD COLUMN IF NOT EXISTS intake_type_source text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS intake_type_reason text,
  ADD COLUMN IF NOT EXISTS intake_route text,
  ADD COLUMN IF NOT EXISTS verification text,
  ADD COLUMN IF NOT EXISTS field_checks jsonb,
  ADD COLUMN IF NOT EXISTS model_runs jsonb,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extracted_base_amount numeric,
  ADD COLUMN IF NOT EXISTS extracted_iban text,
  ADD COLUMN IF NOT EXISTS extracted_account_number text,
  ADD COLUMN IF NOT EXISTS extracted_period_start date,
  ADD COLUMN IF NOT EXISTS extracted_period_end date,
  ADD COLUMN IF NOT EXISTS extracted_referenced_document_number text,
  ADD COLUMN IF NOT EXISTS matched_bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_period text,
  ADD COLUMN IF NOT EXISTS credit_note_original_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_match_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_match_candidates jsonb,
  ADD COLUMN IF NOT EXISTS settled_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_payment_id uuid,
  ADD COLUMN IF NOT EXISTS filed_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_copy_error text;

ALTER TABLE public.financial_document_review_queue
  ADD CONSTRAINT fdrq_intake_type_chk CHECK (intake_type IS NULL OR intake_type IN (
    'fatura_compra','nota_credito','recibo','comprovativo_pagamento','extrato_bancario',
    'nota_lancamento','fatura_emitida','documento_fiscal','contrato_outro','nao_financeiro','desconhecido')),
  ADD CONSTRAINT fdrq_intake_route_chk CHECK (intake_route IS NULL OR intake_route IN (
    'triage','purchases','payments','bank','issued','other','ignored','retry')),
  ADD CONSTRAINT fdrq_intake_type_source_chk CHECK (intake_type_source IN ('ai','manual')),
  ADD CONSTRAINT fdrq_verification_chk CHECK (verification IS NULL OR verification IN ('full','partial','none')),
  ADD CONSTRAINT fdrq_bank_period_chk CHECK (bank_period IS NULL OR bank_period ~ '^[0-9]{4}-[0-9]{2}$');

CREATE INDEX IF NOT EXISTS fdrq_intake_route_idx ON public.financial_document_review_queue (intake_route, status);
CREATE INDEX IF NOT EXISTS fdrq_retry_after_idx ON public.financial_document_review_queue (retry_after) WHERE retry_after IS NOT NULL;