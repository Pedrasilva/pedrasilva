CREATE OR REPLACE FUNCTION public.fin_queue_bank_paid_with_raw(r financial_document_review_queue, OUT card_id uuid, OUT account_id uuid, OUT tx_id uuid)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.fin_queue_bank_paid_with(r public.financial_document_review_queue, OUT card_id uuid, OUT account_id uuid, OUT tx_id uuid)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s record; f record;
BEGIN
  SELECT * INTO s FROM public.fin_queue_bank_paid_with_raw(r);
  IF s.tx_id IS NULL THEN RETURN; END IF;
  IF r.payment_method IN ('bank_transfer','direct_debit','mbway') AND s.card_id IS NOT NULL THEN
    SELECT bank_account_id INTO s.account_id FROM public.bank_transactions WHERE id=s.tx_id; s.card_id:=NULL;
  END IF;
  SELECT * INTO f FROM public.fin_paid_with_fits(r.payment_method,r.paid_by_holder,s.card_id,s.account_id);
  card_id:=f.card_id; account_id:=f.account_id;
  IF card_id IS NOT NULL OR account_id IS NOT NULL THEN tx_id:=s.tx_id; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.fin_queue_bank_paid_with_raw(public.financial_document_review_queue) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_queue_bank_paid_with_raw(public.financial_document_review_queue) TO authenticated,service_role;

DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.fin_confirm_queue_item(uuid,jsonb)'::regprocedure);
  IF position('  -- 3) every rule' IN definition)=0 THEN RAISE EXCEPTION 'Expected confirmation step not found'; END IF;
  definition := replace(definition, '  -- 3) every rule', $replacement$  -- Resolve the exact bank match under the same lock before readiness/finalisation.
  IF r.paid_from_card_id IS NULL AND r.paid_from_account_id IS NULL AND NOT r.marked_unpaid THEN
    SELECT * INTO ex FROM public.fin_queue_bank_paid_with(r);
    IF ex.card_id IS NOT NULL OR ex.account_id IS NOT NULL THEN
      UPDATE public.financial_document_review_queue SET paid_from_card_id=ex.card_id,
        paid_from_account_id=ex.account_id, paid_with_source='bank', paid_method_unknown=false WHERE id=_id;
      SELECT * INTO r FROM public.financial_document_review_queue WHERE id=_id;
    END IF;
  END IF;
  -- 3) every rule$replacement$);
  EXECUTE definition;
END $migration$;
