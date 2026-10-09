ALTER TABLE public.payment_cards
  ADD COLUMN IF NOT EXISTS device_last4 jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_cards ADD CONSTRAINT payment_cards_device_last4_array CHECK (jsonb_typeof(device_last4) = 'array');
ALTER TABLE public.payment_cards ADD CONSTRAINT payment_cards_personal_no_account CHECK (NOT is_personal OR bank_account_id IS NULL);
COMMENT ON COLUMN public.payment_cards.device_last4 IS 'Apple Pay / Google Pay device numbers: [{"last4":"1742","label":"iPhone"}]';

ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS personal_card_decision text CHECK (personal_card_decision IN ('personal','psa_paid_by_holder')),
  ADD COLUMN IF NOT EXISTS personal_card_decided_by uuid,
  ADD COLUMN IF NOT EXISTS personal_card_decided_at timestamptz;

CREATE OR REPLACE FUNCTION public.fin_card_by_last4(_entity uuid, _last4 text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END
  FROM payment_cards pc WHERE pc.entity_id = _entity AND pc.active AND _last4 ~ '^[0-9]{4}$'
   AND (pc.last4 = _last4 OR EXISTS (SELECT 1 FROM jsonb_array_elements(pc.device_last4) d WHERE d->>'last4' = _last4))
$$;