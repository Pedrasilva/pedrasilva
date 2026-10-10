ALTER TABLE public.payment_cards ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('card','bank_transfer','direct_debit','mbway','cash','unknown')),
  ADD COLUMN IF NOT EXISTS paid_by_holder text;
ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('card','bank_transfer','direct_debit','mbway','cash','unknown')),
  ADD COLUMN IF NOT EXISTS paid_by_holder text;
COMMENT ON COLUMN public.financial_document_review_queue.payment_method IS 'Guided "Pago com" step 1 (how it was paid); unknown = "Não sei". Card/account may stay empty (partial answer).';
COMMENT ON COLUMN public.financial_document_review_queue.paid_by_holder IS 'Guided "Pago com" step 2: card holder name (payment_cards.holder_name) when known.';

-- Is a bank-line result consistent with what the reviewer already knows?
CREATE OR REPLACE FUNCTION public.fin_paid_with_fits(_method text, _holder text, _card uuid, _account uuid, OUT card_id uuid, OUT account_id uuid)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; h text;
BEGIN
  IF _method = 'cash' THEN RETURN; END IF;
  IF _card IS NOT NULL THEN
    SELECT holder_name INTO h FROM payment_cards WHERE id = _card;
    IF _method IN ('bank_transfer','direct_debit','mbway') THEN RETURN; END IF;
    IF _holder IS NOT NULL AND h IS DISTINCT FROM _holder THEN RETURN; END IF;
    card_id := _card; RETURN;
  END IF;
  IF _account IS NOT NULL THEN
    SELECT account_kind::text INTO k FROM bank_accounts WHERE id = _account;
    IF _method = 'card' AND k IS DISTINCT FROM 'credit_card' THEN RETURN; END IF;
    IF _method IN ('bank_transfer','direct_debit','mbway') AND k = 'credit_card' THEN RETURN; END IF;
    IF _holder IS NOT NULL AND k = 'credit_card' AND NOT EXISTS (SELECT 1 FROM payment_cards p WHERE p.bank_account_id = _account AND p.holder_name = _holder) THEN RETURN; END IF;
    account_id := _account;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_queue_fill_paid_with() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; f record; c uuid; h text;
BEGIN
  IF NEW.status::text <> 'pending_review' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.paid_from_card_id IS DISTINCT FROM OLD.paid_from_card_id OR NEW.paid_from_account_id IS DISTINCT FROM OLD.paid_from_account_id)
     AND NEW.paid_with_source IS NOT DISTINCT FROM OLD.paid_with_source THEN
    NEW.paid_with_source := CASE WHEN NEW.paid_from_card_id IS NULL AND NEW.paid_from_account_id IS NULL THEN NULL ELSE 'manual' END;
  END IF;
  IF NOT NEW.marked_unpaid AND NEW.paid_from_card_id IS NULL AND NEW.paid_from_account_id IS NULL THEN
    -- card number printed on the receipt
    IF NEW.extracted_card_last4 IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.extracted_card_last4 IS DISTINCT FROM OLD.extracted_card_last4) THEN
      c := public.fin_card_by_last4(NEW.entity_id, NEW.extracted_card_last4);
      SELECT x.card_id INTO c FROM public.fin_paid_with_fits(NEW.payment_method, NEW.paid_by_holder, c, NULL) x;
      IF c IS NOT NULL THEN NEW.paid_from_card_id := c; NEW.paid_with_source := 'card_print'; END IF;
    END IF;
    -- bank line at confirm (supplier approval step)
    IF NEW.paid_from_card_id IS NULL AND TG_OP = 'UPDATE' AND NEW.supplier_approved_at IS DISTINCT FROM OLD.supplier_approved_at AND NEW.supplier_approved_at IS NOT NULL THEN
      SELECT * INTO s FROM public.fin_queue_bank_paid_with(NEW);
      IF s.tx_id IS NOT NULL AND NEW.payment_method IN ('bank_transfer','direct_debit','mbway') AND s.card_id IS NOT NULL THEN
        SELECT bank_account_id INTO s.account_id FROM bank_transactions WHERE id = s.tx_id; s.card_id := NULL;
      END IF;
      SELECT * INTO f FROM public.fin_paid_with_fits(NEW.payment_method, NEW.paid_by_holder, s.card_id, s.account_id);
      IF f.card_id IS NOT NULL OR f.account_id IS NOT NULL THEN
        NEW.paid_from_card_id := f.card_id; NEW.paid_from_account_id := f.account_id; NEW.paid_with_source := 'bank';
      END IF;
    END IF;
    -- supplier habit (only while nothing is known about the payment)
    IF NEW.paid_from_card_id IS NULL AND NEW.paid_from_account_id IS NULL AND NEW.payment_method IS NULL AND NOT NEW.paid_method_unknown
       AND NEW.matched_supplier_id IS NOT NULL AND NEW.direction::text <> 'issued'
       AND (TG_OP = 'INSERT' OR NEW.matched_supplier_id IS DISTINCT FROM OLD.matched_supplier_id OR NEW.supplier_approved_at IS DISTINCT FROM OLD.supplier_approved_at) THEN
      SELECT * INTO s FROM public.fin_supplier_habit_paid_with(NEW.entity_id, NEW.matched_supplier_id);
      IF s.card_id IS NOT NULL OR s.account_id IS NOT NULL THEN
        NEW.paid_from_card_id := s.card_id; NEW.paid_from_account_id := CASE WHEN s.card_id IS NULL THEN s.account_id END;
        NEW.paid_with_source := 'habitual';
      END IF;
    END IF;
  END IF;
  -- derive the guided steps
  IF NEW.marked_unpaid THEN
    NEW.payment_method := NULL; NEW.paid_by_holder := NULL;
  ELSIF NEW.paid_from_card_id IS NOT NULL THEN
    SELECT holder_name INTO h FROM payment_cards WHERE id = NEW.paid_from_card_id;
    NEW.payment_method := 'card'; NEW.paid_by_holder := h;
  END IF;
  IF NEW.payment_method IS NOT NULL THEN
    NEW.paid_method_unknown := NEW.paid_from_card_id IS NULL AND NEW.paid_from_account_id IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fin_queue_copy_paid_flags() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_expense_id IS NOT NULL AND NEW.status::text = 'approved' AND OLD.status::text IS DISTINCT FROM 'approved' THEN
    UPDATE financial_documents SET paid_method_unknown = NEW.paid_method_unknown AND paid_from_card_id IS NULL AND paid_from_account_id IS NULL,
                                   paid_with_source = coalesce(paid_with_source, NEW.paid_with_source),
                                   payment_method = coalesce(payment_method, NEW.payment_method),
                                   paid_by_holder = coalesce(paid_by_holder, NEW.paid_by_holder)
     WHERE id = NEW.created_expense_id;
  END IF;
  RETURN NEW;
END $$;

-- Reviewer's partial answer (method, holder) saved before confirm.
CREATE OR REPLACE FUNCTION public.fin_queue_set_paid_how(_id uuid, _method text, _holder text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; uid uuid := auth.uid();
BEGIN
  SELECT entity_id, status INTO r FROM financial_document_review_queue WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF uid IS NULL OR r.entity_id IS DISTINCT FROM public.current_finance_entity() OR NOT public.has_entity_access(r.entity_id)
     OR NOT (public.has_role(uid, 'admin') OR public.has_permission(uid, 'finance.dashboard')) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF r.status::text <> 'pending_review' THEN RAISE EXCEPTION 'BLOCKED:status'; END IF;
  UPDATE financial_document_review_queue SET payment_method = nullif(_method, ''),
    paid_by_holder = CASE WHEN _method = 'card' THEN nullif(_holder, '') END,
    paid_method_unknown = CASE WHEN nullif(_method, '') IS NULL THEN false ELSE paid_method_unknown END,
    marked_unpaid = CASE WHEN nullif(_method, '') IS NOT NULL THEN false ELSE marked_unpaid END
   WHERE id = _id;
  INSERT INTO finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'paid_how', jsonb_build_object('method', _method, 'holder', _holder), uid);
END $$;
REVOKE ALL ON FUNCTION public.fin_queue_set_paid_how(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_queue_set_paid_how(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_paid_with_fits(text, text, uuid, uuid) TO authenticated;

-- Reconciliation uses what is known (holder, method).
CREATE OR REPLACE FUNCTION public.fin_payment_set_paid_from() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; d record; f record; acct uuid;
BEGIN
  IF NEW.bank_transaction_id IS NULL THEN RETURN NEW; END IF;
  SELECT payment_method, paid_by_holder INTO d FROM financial_documents WHERE id = NEW.document_id;
  SELECT * INTO r FROM public.fin_paid_from_of_bank_line(NEW.bank_transaction_id);
  IF d.payment_method IN ('bank_transfer','direct_debit','mbway') AND r.card_id IS NOT NULL THEN
    SELECT bank_account_id INTO acct FROM bank_transactions WHERE id = NEW.bank_transaction_id;
    r.card_id := NULL; r.account_id := acct;
  END IF;
  SELECT * INTO f FROM public.fin_paid_with_fits(d.payment_method, d.paid_by_holder, r.card_id, r.account_id);
  UPDATE financial_documents x SET paid_from_card_id = f.card_id, paid_from_account_id = f.account_id,
         paid_with_source = 'bank', paid_method_unknown = false,
         payment_method = CASE WHEN f.card_id IS NOT NULL THEN 'card' ELSE x.payment_method END,
         paid_by_holder = CASE WHEN f.card_id IS NOT NULL THEN (SELECT holder_name FROM payment_cards WHERE id = f.card_id) ELSE x.paid_by_holder END
   WHERE x.id = NEW.document_id AND x.paid_from_card_id IS NULL AND x.paid_from_account_id IS NULL
     AND (f.card_id IS NOT NULL OR f.account_id IS NOT NULL);
  RETURN NEW;
END $$;

-- Backfill: AI-read method -> payment_method; printed last 4 -> card when exactly one matches in the entity.
UPDATE public.financial_document_review_queue SET payment_method = extracted_payment_method
 WHERE payment_method IS NULL AND extracted_payment_method IN ('card','bank_transfer','direct_debit','cash');
UPDATE public.financial_document_review_queue q SET paid_from_card_id = public.fin_card_by_last4(q.entity_id, q.extracted_card_last4), paid_with_source = 'card_print'
 WHERE q.status::text = 'pending_review' AND q.extracted_card_last4 IS NOT NULL AND NOT q.marked_unpaid
   AND q.paid_from_card_id IS NULL AND q.paid_from_account_id IS NULL
   AND public.fin_card_by_last4(q.entity_id, q.extracted_card_last4) IS NOT NULL;