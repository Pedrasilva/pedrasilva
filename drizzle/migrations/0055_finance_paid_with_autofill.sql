-- "Pago com" filled by the Hub: supplier habit, bank line at confirm, "meio por identificar".
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS paid_method_unknown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_with_source text CHECK (paid_with_source IN ('habitual','bank','manual','card_print'));
ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS paid_method_unknown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_with_source text CHECK (paid_with_source IN ('habitual','bank','manual','card_print'));
COMMENT ON COLUMN public.financial_document_review_queue.paid_method_unknown IS 'Reviewer chose "Pago — meio por identificar": paid, method filled later from bank reconciliation.';
COMMENT ON COLUMN public.financial_document_review_queue.paid_with_source IS 'Where "Pago com" came from: habitual (supplier habit), bank (bank line), manual, card_print.';

-- Supplier habit: the last 3 non-cancelled documents of this supplier in this entity, all with the same card/account.
CREATE OR REPLACE FUNCTION public.fin_supplier_habit_paid_with(_entity uuid, _supplier uuid, OUT card_id uuid, OUT account_id uuid)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; nd int; nnull int;
BEGIN
  IF _entity IS NULL OR _supplier IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_entity_access(_entity) THEN RETURN; END IF;
  WITH last3 AS (
    SELECT d.paid_from_card_id c, d.paid_from_account_id a FROM financial_documents d
     WHERE d.entity_id = _entity AND d.counterparty_supplier_id = _supplier AND d.status::text <> 'cancelled'
     ORDER BY d.issue_date DESC NULLS LAST, d.created_at DESC LIMIT 3)
  SELECT count(*), count(DISTINCT coalesce(c::text,'') || '|' || coalesce(a::text,'')),
         count(*) FILTER (WHERE c IS NULL AND a IS NULL),
         (array_agg(c))[1], (array_agg(a))[1]
    INTO n, nd, nnull, card_id, account_id FROM last3;
  IF n < 3 OR nd <> 1 OR nnull > 0 THEN card_id := NULL; account_id := NULL; RETURN; END IF;
  -- never suggest an inactive card or archived account
  IF card_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_cards p WHERE p.id = card_id AND p.active) THEN card_id := NULL; account_id := NULL; END IF;
  IF account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bank_accounts b WHERE b.id = account_id AND b.archived_at IS NULL) THEN card_id := NULL; account_id := NULL; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_supplier_habit_paid_with(uuid, uuid) TO authenticated;

-- Bank line: exactly one outgoing line in the entity, same amount (±0.01), date ±5 days, not paying another document.
CREATE OR REPLACE FUNCTION public.fin_queue_bank_paid_with(r public.financial_document_review_queue, OUT card_id uuid, OUT account_id uuid, OUT tx_id uuid)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; t record; tok text; c uuid; nc int;
BEGIN
  IF r.entity_id IS NULL OR r.extracted_amount IS NULL OR r.extracted_date IS NULL OR r.direction::text = 'issued' THEN RETURN; END IF;
  SELECT count(*), (array_agg(bt.id))[1] INTO n, tx_id FROM bank_transactions bt
   WHERE bt.entity_id = r.entity_id AND bt.amount < 0
     AND abs(abs(bt.amount) - abs(r.extracted_amount)) <= 0.01
     AND bt.transaction_date BETWEEN r.extracted_date - 5 AND r.extracted_date + 5
     AND NOT EXISTS (SELECT 1 FROM financial_document_payments p WHERE p.bank_transaction_id = bt.id);
  IF n <> 1 THEN tx_id := NULL; RETURN; END IF;
  SELECT description INTO t FROM bank_transactions WHERE id = tx_id;
  -- card by a 4-digit number on the line (own last4 or device), unique among active cards
  FOR tok IN SELECT m[1] FROM regexp_matches(coalesce(t.description,''), '(?:^|\D)(\d{4})(?:\D|$)', 'g') m LOOP
    SELECT count(*), (array_agg(p.id))[1] INTO nc, c FROM payment_cards p
     WHERE p.entity_id = r.entity_id AND p.active
       AND (p.last4 = tok OR EXISTS (SELECT 1 FROM jsonb_array_elements(p.device_last4) d WHERE d->>'last4' = tok));
    IF nc = 1 THEN card_id := c; RETURN; END IF;
  END LOOP;
  SELECT x.card_id, x.account_id INTO card_id, account_id FROM public.fin_paid_from_of_bank_line(tx_id) x;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_queue_bank_paid_with(public.financial_document_review_queue) TO authenticated;

-- Fill on the queue row: habit when the supplier is (re)matched, bank line at confirm (supplier approval step).
CREATE OR REPLACE FUNCTION public.fin_queue_fill_paid_with() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  IF NEW.status::text <> 'pending_review' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.paid_from_card_id IS DISTINCT FROM OLD.paid_from_card_id OR NEW.paid_from_account_id IS DISTINCT FROM OLD.paid_from_account_id)
     AND NEW.paid_with_source IS NOT DISTINCT FROM OLD.paid_with_source THEN
    NEW.paid_with_source := CASE WHEN NEW.paid_from_card_id IS NULL AND NEW.paid_from_account_id IS NULL THEN NULL ELSE 'manual' END;
  END IF;
  IF NEW.paid_from_card_id IS NOT NULL OR NEW.paid_from_account_id IS NOT NULL OR NEW.marked_unpaid OR NEW.paid_method_unknown THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.supplier_approved_at IS DISTINCT FROM OLD.supplier_approved_at AND NEW.supplier_approved_at IS NOT NULL THEN
    SELECT * INTO s FROM public.fin_queue_bank_paid_with(NEW);
    IF s.card_id IS NOT NULL OR s.account_id IS NOT NULL THEN
      NEW.paid_from_card_id := s.card_id; NEW.paid_from_account_id := CASE WHEN s.card_id IS NULL THEN s.account_id END;
      NEW.paid_with_source := 'bank'; RETURN NEW;
    END IF;
  END IF;
  IF NEW.matched_supplier_id IS NOT NULL AND NEW.direction::text <> 'issued'
     AND (TG_OP = 'INSERT' OR NEW.matched_supplier_id IS DISTINCT FROM OLD.matched_supplier_id OR NEW.supplier_approved_at IS DISTINCT FROM OLD.supplier_approved_at) THEN
    SELECT * INTO s FROM public.fin_supplier_habit_paid_with(NEW.entity_id, NEW.matched_supplier_id);
    IF s.card_id IS NOT NULL OR s.account_id IS NOT NULL THEN
      NEW.paid_from_card_id := s.card_id; NEW.paid_from_account_id := CASE WHEN s.card_id IS NULL THEN s.account_id END;
      NEW.paid_with_source := 'habitual';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_fdrq_fill_paid_with ON public.financial_document_review_queue;
CREATE TRIGGER zz_fdrq_fill_paid_with BEFORE INSERT OR UPDATE ON public.financial_document_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.fin_queue_fill_paid_with();

-- Carry the flags to the document created on confirm.
CREATE OR REPLACE FUNCTION public.fin_queue_copy_paid_flags() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_expense_id IS NOT NULL AND NEW.status::text = 'approved' AND OLD.status::text IS DISTINCT FROM 'approved' THEN
    UPDATE financial_documents SET paid_method_unknown = NEW.paid_method_unknown AND paid_from_card_id IS NULL AND paid_from_account_id IS NULL,
                                   paid_with_source = coalesce(paid_with_source, NEW.paid_with_source)
     WHERE id = NEW.created_expense_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fdrq_copy_paid_flags ON public.financial_document_review_queue;
CREATE TRIGGER fdrq_copy_paid_flags AFTER UPDATE OF status ON public.financial_document_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.fin_queue_copy_paid_flags();

-- Reviewer choice saved before confirm (the confirm transaction then sees it).
CREATE OR REPLACE FUNCTION public.fin_queue_set_paid_unknown(_id uuid, _value boolean) RETURNS void
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
  UPDATE financial_document_review_queue SET paid_method_unknown = coalesce(_value, false),
    marked_unpaid = CASE WHEN coalesce(_value, false) THEN false ELSE marked_unpaid END
   WHERE id = _id;
  INSERT INTO finance_intake_confirm_log(entity_id, queue_item_id, step, detail, actor)
    VALUES (r.entity_id, _id, 'paid_method_unknown', jsonb_build_object('value', coalesce(_value, false)), uid);
END $$;
REVOKE ALL ON FUNCTION public.fin_queue_set_paid_unknown(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_queue_set_paid_unknown(uuid, boolean) TO authenticated;

-- Reconciliation fills "Pago com" from the bank line and clears "meio por identificar".
CREATE OR REPLACE FUNCTION public.fin_payment_set_paid_from() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.bank_transaction_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.fin_paid_from_of_bank_line(NEW.bank_transaction_id);
  UPDATE financial_documents d SET paid_from_card_id = r.card_id, paid_from_account_id = r.account_id,
         paid_with_source = 'bank', paid_method_unknown = false
   WHERE d.id = NEW.document_id AND d.paid_from_card_id IS NULL AND d.paid_from_account_id IS NULL
     AND (r.card_id IS NOT NULL OR r.account_id IS NOT NULL);
  RETURN NEW;
END $$;

CREATE INDEX IF NOT EXISTS fd_paid_unknown_idx ON public.financial_documents(entity_id, created_at) WHERE paid_method_unknown;

CREATE OR REPLACE FUNCTION public.fin_queue_blockers(r public.financial_document_review_queue)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE b text[] := '{}'; issued boolean := r.direction = 'issued';
  cid uuid; c record; cls record; vat text; ccode text;
BEGIN
  IF r.status::text <> 'pending_review' THEN RETURN ARRAY['status']; END IF;
  IF coalesce(r.intake_route, '') NOT IN ('purchases', 'issued') THEN RETURN ARRAY['not_confirmable']; END IF;
  IF r.entity_conflict_ids IS NOT NULL AND cardinality(r.entity_conflict_ids) > 0 THEN b := array_append(b, 'two_entities'); END IF;
  IF r.entity_id IS NULL THEN b := array_append(b, 'entity'); END IF;
  IF r.intake_type IS NULL OR r.intake_type = 'desconhecido' THEN b := array_append(b, 'doc_type'); END IF;
  IF r.direction::text = 'unclear' THEN b := array_append(b, 'direction'); END IF;
  IF r.extracted_date IS NULL THEN b := array_append(b, 'date'); END IF;
  IF r.extracted_amount IS NULL THEN b := array_append(b, 'total'); END IF;

  cid := CASE WHEN issued THEN r.matched_client_id ELSE r.matched_supplier_id END;
  vat := CASE WHEN issued THEN r.extracted_buyer_vat ELSE coalesce(r.extracted_supplier_vat, r.extracted_seller_vat) END;
  IF cid IS NOT NULL THEN
    SELECT co.is_platform, co.nif, co.foreign_tax_id INTO c FROM public.companies co WHERE co.id = cid;
    IF coalesce(c.is_platform, false) THEN
      IF coalesce(btrim(r.issuer_name), '') = '' THEN b := array_append(b, 'platform_issuer'); END IF;
    ELSIF NOT (coalesce(public.fin_pt_nif_valid(c.nif), false) OR coalesce(btrim(c.foreign_tax_id), '') <> '') THEN
      b := array_append(b, 'counterparty_tax');
    END IF;
  ELSIF NOT public.fin_tax_number_ok(vat) THEN
    b := array_append(b, 'counterparty');
  END IF;

  IF r.suggested_classification_id IS NULL THEN b := array_append(b, 'category');
  ELSE
    SELECT fc.level::text AS lvl, fc.active, fc.entity_id AS ent, fc.code AS cd INTO cls
      FROM public.financial_classifications fc WHERE fc.id = r.suggested_classification_id;
    IF cls.lvl IS DISTINCT FROM 'category' OR NOT coalesce(cls.active, false) OR cls.ent IS DISTINCT FROM r.entity_id THEN
      b := array_append(b, 'category_group');
    END IF;
    ccode := cls.cd;
    IF ccode IS NOT NULL AND (ccode = 'BEN' OR ccode LIKE 'BEN.%' OR ccode IN ('PES.FOOD','PES.HEALTH','PES.PERS','PES.OTHER'))
       AND r.assigned_collaborator_id IS NULL THEN b := array_append(b, 'collaborator'); END IF;
  END IF;

  IF r.paid_from_card_id IS NULL AND r.paid_from_account_id IS NULL AND NOT r.marked_unpaid
     AND NOT coalesce(r.paid_method_unknown, false)
     AND (SELECT s.card_id IS NULL AND s.account_id IS NULL FROM public.fin_queue_bank_paid_with(r) s) THEN
    b := array_append(b, CASE WHEN r.extracted_card_last4 IS NOT NULL THEN 'card_unknown' ELSE 'paid_with' END);
  END IF;

  IF jsonb_typeof(r.possible_duplicates) = 'array' AND jsonb_array_length(r.possible_duplicates) > 0
     AND NOT coalesce(r.possible_duplicate_resolved, false) THEN b := array_append(b, 'duplicate'); END IF;
  RETURN b;
END $$;