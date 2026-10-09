CREATE TABLE public.payment_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.finance_entities(id),
  holder_name text,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  network text NOT NULL DEFAULT 'other' CHECK (network IN ('visa','mastercard','other')),
  card_type text NOT NULL DEFAULT 'debit' CHECK (card_type IN ('debit','credit')),
  bank text,
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  bank_refs text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.payment_cards IS 'Company payment cards per entity. Stores ONLY the last 4 digits, never a full card number.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_cards TO authenticated;
GRANT ALL ON public.payment_cards TO service_role;
ALTER TABLE public.payment_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users read payment_cards" ON public.payment_cards FOR SELECT TO authenticated
  USING ((has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard')) AND fin_row_visible(entity_id));
CREATE POLICY "Finance users insert payment_cards" ON public.payment_cards FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.documents.edit')) AND fin_row_visible(entity_id));
CREATE POLICY "Finance users update payment_cards" ON public.payment_cards FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.documents.edit')) AND fin_row_visible(entity_id))
  WITH CHECK ((has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.documents.edit')) AND fin_row_visible(entity_id));
CREATE INDEX payment_cards_entity_idx ON public.payment_cards(entity_id);
CREATE TRIGGER payment_cards_require_entity BEFORE INSERT ON public.payment_cards FOR EACH ROW EXECUTE FUNCTION fin_require_entity();
CREATE TRIGGER payment_cards_updated_at BEFORE UPDATE ON public.payment_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER payment_cards_guard_entity BEFORE INSERT OR UPDATE ON public.payment_cards FOR EACH ROW
  EXECUTE FUNCTION fin_guard_entity_refs('bank_account_id','bank_accounts');

ALTER TABLE public.bank_accounts ADD COLUMN settles_from_account_id uuid REFERENCES public.bank_accounts(id);
CREATE TRIGGER bank_accounts_guard_entity BEFORE INSERT OR UPDATE ON public.bank_accounts FOR EACH ROW
  EXECUTE FUNCTION fin_guard_entity_refs('settles_from_account_id','bank_accounts');

ALTER TABLE public.financial_documents ADD COLUMN paid_from_card_id uuid REFERENCES public.payment_cards(id);
ALTER TABLE public.financial_documents ADD CONSTRAINT financial_documents_paid_from_one CHECK (paid_from_card_id IS NULL OR paid_from_account_id IS NULL);
ALTER TABLE public.financial_document_review_queue ADD COLUMN paid_from_card_id uuid REFERENCES public.payment_cards(id);
ALTER TABLE public.financial_document_review_queue ADD CONSTRAINT fdrq_paid_from_one CHECK (paid_from_card_id IS NULL OR paid_from_account_id IS NULL);
ALTER TABLE public.financial_expense_items ADD COLUMN paid_from_card_id uuid REFERENCES public.payment_cards(id);
ALTER TABLE public.financial_expense_items ADD COLUMN paid_from_account_id uuid REFERENCES public.bank_accounts(id);
ALTER TABLE public.financial_expense_items ADD CONSTRAINT fei_paid_from_one CHECK (paid_from_card_id IS NULL OR paid_from_account_id IS NULL);
CREATE TRIGGER fd_guard_paid_from BEFORE INSERT OR UPDATE ON public.financial_documents FOR EACH ROW
  EXECUTE FUNCTION fin_guard_entity_refs('paid_from_card_id','payment_cards','paid_from_account_id','bank_accounts');
CREATE TRIGGER fdrq_guard_paid_from BEFORE INSERT OR UPDATE ON public.financial_document_review_queue FOR EACH ROW
  EXECUTE FUNCTION fin_guard_entity_refs('paid_from_card_id','payment_cards','paid_from_account_id','bank_accounts');
CREATE TRIGGER fei_guard_paid_from BEFORE INSERT OR UPDATE ON public.financial_expense_items FOR EACH ROW
  EXECUTE FUNCTION fin_guard_entity_refs('paid_from_card_id','payment_cards','paid_from_account_id','bank_accounts');

CREATE OR REPLACE FUNCTION public.fin_set_created_by() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fd_set_created_by BEFORE INSERT ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION fin_set_created_by();
CREATE TRIGGER fei_set_created_by BEFORE INSERT ON public.financial_expense_items FOR EACH ROW EXECUTE FUNCTION fin_set_created_by();
CREATE TRIGGER btc_set_created_by BEFORE INSERT ON public.bank_transaction_classifications FOR EACH ROW EXECUTE FUNCTION fin_set_created_by();
ALTER TABLE public.company_expenses ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TRIGGER ce_set_created_by BEFORE INSERT ON public.company_expenses FOR EACH ROW EXECUTE FUNCTION fin_set_created_by();

CREATE OR REPLACE FUNCTION public.fin_user_display_name(_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN has_role(auth.uid(),'admin') OR has_permission(auth.uid(),'finance.dashboard') THEN
    COALESCE((SELECT c.nome FROM collaborators c JOIN auth.users u ON lower(u.email) = lower(c.email) WHERE u.id = _user_id LIMIT 1),
             (SELECT u.email::text FROM auth.users u WHERE u.id = _user_id)) END
$$;
GRANT EXECUTE ON FUNCTION public.fin_user_display_name(uuid) TO authenticated;