DO $$ BEGIN
  CREATE TYPE public.fdrq_direction AS ENUM ('issued','received','unclear');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS direction public.fdrq_direction NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS direction_confidence numeric,
  ADD COLUMN IF NOT EXISTS extracted_seller_name text,
  ADD COLUMN IF NOT EXISTS extracted_seller_vat text,
  ADD COLUMN IF NOT EXISTS extracted_buyer_name text,
  ADD COLUMN IF NOT EXISTS extracted_buyer_vat text,
  ADD COLUMN IF NOT EXISTS matched_client_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_match_status public.fdrq_supplier_match NOT NULL DEFAULT 'no_match',
  ADD COLUMN IF NOT EXISTS ambiguous_client_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_fdrq_direction ON public.financial_document_review_queue (direction);
CREATE INDEX IF NOT EXISTS idx_fdrq_matched_client ON public.financial_document_review_queue (matched_client_id);