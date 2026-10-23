-- Card statements: look for the bill debit on the current account the card settles from.
CREATE OR REPLACE FUNCTION public.fin_period_window(_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.bank_statement_periods%ROWTYPE;
  prev public.bank_statement_periods%ROWTYPE;
  q public.financial_document_review_queue%ROWTYPE;
  v jsonb;
  v_gaps jsonb;
  v_dups jsonb;
  v_outside jsonb;
  v_card jsonb := NULL;
  v_card_tx jsonb := NULL;
  v_settle uuid;
  v_due date;
  v_amt numeric;
BEGIN
  SELECT * INTO p FROM public.bank_statement_periods WHERE id = _period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO prev FROM public.bank_statement_periods
   WHERE bank_account_id = p.bank_account_id
     AND payment_card_id IS NOT DISTINCT FROM p.payment_card_id
     AND period_end_date < p.period_start_date
   ORDER BY period_end_date DESC LIMIT 1;

  WITH tx AS (
    SELECT bt.* FROM public.bank_transactions bt
     WHERE bt.bank_account_id = p.bank_account_id
       AND (bt.statement_period_id = p.id
            OR (bt.statement_period_id IS NULL AND bt.transaction_date BETWEEN p.period_start_date AND p.period_end_date))
  )
  SELECT jsonb_build_object(
    'tx_count', COUNT(*),
    'imported_total', COALESCE(SUM(amount) FILTER (WHERE COALESCE(ignored_reason,'') <> 'duplicate'), 0),
    'matched_count', COUNT(*) FILTER (WHERE reconciled_at IS NOT NULL),
    'matched_total', COALESCE(SUM(amount) FILTER (WHERE reconciled_at IS NOT NULL), 0),
    'duplicate_flagged_count', COUNT(*) FILTER (WHERE ignored_reason = 'duplicate'),
    'unmatched_count', COUNT(*) FILTER (WHERE reconciled_at IS NULL AND COALESCE(ignored_reason,'') <> 'duplicate'),
    'unmatched_total', COALESCE(SUM(abs(amount)) FILTER (WHERE reconciled_at IS NULL AND COALESCE(ignored_reason,'') <> 'duplicate'), 0)
  ) INTO v FROM tx;

  WITH d AS (
    SELECT DISTINCT transaction_date AS dt FROM public.bank_transactions bt
     WHERE bt.bank_account_id = p.bank_account_id
       AND (bt.statement_period_id = p.id
            OR (bt.statement_period_id IS NULL AND bt.transaction_date BETWEEN p.period_start_date AND p.period_end_date))
       AND bt.transaction_date BETWEEN p.period_start_date AND p.period_end_date
    UNION SELECT (p.period_start_date - 1)
    UNION SELECT (p.period_end_date + 1)
  ), s AS (
    SELECT dt, LEAD(dt) OVER (ORDER BY dt) AS nx FROM d
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('from', dt + 1, 'to', nx - 1) ORDER BY dt), '[]'::jsonb)
    INTO v_gaps FROM s WHERE nx IS NOT NULL AND nx - dt - 1 >= 7;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'date'), '[]'::jsonb) INTO v_dups FROM (
    SELECT jsonb_build_object('date', transaction_date, 'amount', amount, 'description', description,
                              'count', COUNT(*), 'ids', jsonb_agg(id)) AS g
      FROM public.bank_transactions bt
     WHERE bt.bank_account_id = p.bank_account_id
       AND COALESCE(bt.ignored_reason,'') <> 'duplicate'
       AND (bt.statement_period_id = p.id
            OR (bt.statement_period_id IS NULL AND bt.transaction_date BETWEEN p.period_start_date AND p.period_end_date))
     GROUP BY transaction_date, amount, description HAVING COUNT(*) > 1
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'date', transaction_date, 'amount', amount, 'description', description) ORDER BY transaction_date), '[]'::jsonb)
    INTO v_outside FROM public.bank_transactions
   WHERE statement_period_id = p.id
     AND (transaction_date < p.period_start_date OR transaction_date > p.period_end_date);

  IF p.payment_card_id IS NOT NULL AND p.source_queue_item_id IS NOT NULL THEN
    SELECT * INTO q FROM public.financial_document_review_queue WHERE id = p.source_queue_item_id;
    -- A credit card's own account is not where the bill is paid: use the account it settles from.
    SELECT COALESCE(CASE WHEN a.account_kind::text = 'credit_card' THEN a.settles_from_account_id END, c.bank_account_id)
      INTO v_settle
      FROM public.payment_cards c LEFT JOIN public.bank_accounts a ON a.id = c.bank_account_id
     WHERE c.id = p.payment_card_id;
    v_due := COALESCE(NULLIF(q.bank_field_overrides->>'card_due_date','')::date, q.extracted_card_due_date);
    v_amt := COALESCE(NULLIF(q.bank_field_overrides->>'card_amount_to_debit','')::numeric, q.extracted_card_amount_to_debit);
    v_card := jsonb_build_object('due_date', v_due, 'amount_to_debit', v_amt, 'settling_account_id', v_settle);
    IF v_settle IS NOT NULL AND v_amt IS NOT NULL THEN
      SELECT jsonb_agg(jsonb_build_object('id', bt.id, 'date', bt.transaction_date, 'amount', bt.amount,
                                          'description', bt.description, 'status', bt.status,
                                          'reconciled', bt.reconciled_at IS NOT NULL) ORDER BY bt.transaction_date)
        INTO v_card_tx
        FROM public.bank_transactions bt
       WHERE bt.bank_account_id = v_settle
         AND bt.amount < 0
         AND abs(abs(bt.amount) - abs(v_amt)) <= 0.01
         AND bt.transaction_date BETWEEN COALESCE(v_due, p.period_end_date) - 10 AND COALESCE(v_due, p.period_end_date) + 10;
      v_card := v_card || jsonb_build_object('debit_candidates', COALESCE(v_card_tx, '[]'::jsonb));
    END IF;
  END IF;

  RETURN v || jsonb_build_object(
    'period_id', p.id,
    'bank_account_id', p.bank_account_id,
    'payment_card_id', p.payment_card_id,
    'statement_number', p.statement_number,
    'period_start', p.period_start_date,
    'period_end', p.period_end_date,
    'opening_balance', p.opening_balance,
    'closing_balance', p.closing_balance,
    'expected_closing', p.opening_balance + (v->>'imported_total')::numeric,
    'difference', (p.opening_balance + (v->>'imported_total')::numeric) - p.closing_balance,
    'matched_difference', (p.opening_balance + (v->>'matched_total')::numeric) - p.closing_balance,
    'previous_closing', prev.closing_balance,
    'continuity_difference', CASE WHEN prev.id IS NULL THEN NULL ELSE p.opening_balance - prev.closing_balance END,
    'locked_at', p.locked_at,
    'locked_by', p.locked_by,
    'gaps', v_gaps,
    'duplicates', v_dups,
    'outside', v_outside,
    'card', v_card
  );
END;
$function$;