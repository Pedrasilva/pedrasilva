CREATE OR REPLACE FUNCTION public.fin_card_by_last4(_entity uuid, _last4 text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END
  FROM payment_cards WHERE entity_id = _entity AND active AND last4 = _last4 AND _last4 ~ '^[0-9]{4}$'
$$;

CREATE OR REPLACE FUNCTION public.fin_paid_from_of_bank_line(_tx uuid, OUT card_id uuid, OUT account_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; n int;
BEGIN
  SELECT id, entity_id, bank_account_id, description INTO t FROM bank_transactions WHERE id = _tx;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT pc.id INTO card_id FROM payment_cards pc
   WHERE pc.entity_id = t.entity_id AND pc.active
     AND EXISTS (SELECT 1 FROM unnest(pc.bank_refs) r WHERE r <> '' AND position(upper(r) IN upper(coalesce(t.description,''))) > 0)
   LIMIT 1;
  IF card_id IS NULL THEN
    SELECT count(*), (array_agg(pc.id))[1] INTO n, card_id FROM payment_cards pc
     WHERE pc.entity_id = t.entity_id AND pc.active AND pc.card_type = 'credit' AND pc.bank_account_id = t.bank_account_id;
    IF n <> 1 THEN card_id := NULL; END IF;
  END IF;
  IF card_id IS NULL THEN account_id := t.bank_account_id; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_doc_resolve_card() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE l4 text;
BEGIN
  IF NEW.paid_from_card_id IS NOT NULL OR NEW.paid_from_account_id IS NOT NULL THEN RETURN NEW; END IF;
  l4 := CASE WHEN TG_TABLE_NAME = 'financial_documents' THEN to_jsonb(NEW)->>'card_last4' ELSE to_jsonb(NEW)->>'extracted_card_last4' END;
  IF l4 IS NOT NULL THEN NEW.paid_from_card_id := public.fin_card_by_last4(NEW.entity_id, l4); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fd_resolve_card BEFORE INSERT OR UPDATE OF card_last4 ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION fin_doc_resolve_card();
CREATE TRIGGER fdrq_resolve_card BEFORE INSERT OR UPDATE OF extracted_card_last4 ON public.financial_document_review_queue FOR EACH ROW EXECUTE FUNCTION fin_doc_resolve_card();

CREATE OR REPLACE FUNCTION public.fin_payment_set_paid_from() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.bank_transaction_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.fin_paid_from_of_bank_line(NEW.bank_transaction_id);
  UPDATE financial_documents d SET paid_from_card_id = r.card_id, paid_from_account_id = r.account_id
   WHERE d.id = NEW.document_id AND d.paid_from_card_id IS NULL AND d.paid_from_account_id IS NULL
     AND (r.card_id IS NOT NULL OR r.account_id IS NOT NULL);
  RETURN NEW;
END $$;
CREATE TRIGGER fdp_set_paid_from AFTER INSERT ON public.financial_document_payments FOR EACH ROW EXECUTE FUNCTION fin_payment_set_paid_from();

CREATE OR REPLACE FUNCTION public.fin_supplier_usual_card(_supplier uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT d.paid_from_card_id FROM financial_documents d
   WHERE d.counterparty_supplier_id = _supplier AND d.paid_from_card_id IS NOT NULL AND d.entity_id = public.current_finance_entity()
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.fin_supplier_usual_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_card_by_last4(uuid, text) TO authenticated;