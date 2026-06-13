
-- Per-row VAT & payment terms on payment schedule items
ALTER TABLE public.quote_payment_schedule_items
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 23,
  ADD COLUMN IF NOT EXISTS vat_rate_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_terms text;

ALTER TABLE public.quote_payment_schedule_items
  DROP CONSTRAINT IF EXISTS quote_pay_vat_rate_chk;
ALTER TABLE public.quote_payment_schedule_items
  ADD CONSTRAINT quote_pay_vat_rate_chk CHECK (vat_rate >= 0 AND vat_rate <= 100);

-- Quote-level defaults
ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS default_vat_rate numeric NOT NULL DEFAULT 23,
  ADD COLUMN IF NOT EXISTS default_payment_terms text NOT NULL DEFAULT '30 (trinta) dias de calendário',
  ADD COLUMN IF NOT EXISTS first_payment_terms text NOT NULL DEFAULT 'Pronto pagamento';

ALTER TABLE public.fee_proposals
  DROP CONSTRAINT IF EXISTS fee_proposals_default_vat_rate_chk;
ALTER TABLE public.fee_proposals
  ADD CONSTRAINT fee_proposals_default_vat_rate_chk CHECK (default_vat_rate >= 0 AND default_vat_rate <= 100);
