CREATE TABLE IF NOT EXISTS public.bank_statement_period_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.bank_statement_periods(id) ON DELETE CASCADE,
  entity_id uuid,
  action text NOT NULL CHECK (action IN ('locked','reopened')),
  reason text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_statement_period_log_period_idx ON public.bank_statement_period_log(period_id, created_at DESC);
GRANT SELECT ON public.bank_statement_period_log TO authenticated;
GRANT ALL ON public.bank_statement_period_log TO service_role;
REVOKE TRUNCATE ON public.bank_statement_period_log FROM anon, authenticated;
ALTER TABLE public.bank_statement_period_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bank_statement_period_log" ON public.bank_statement_period_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND fin_row_visible(entity_id));

CREATE OR REPLACE FUNCTION public.fin_bank_tx_in_locked_period(_account uuid, _date date, _period uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bank_statement_periods p
     WHERE p.locked_at IS NOT NULL
       AND p.bank_account_id = _account
       AND ((_period IS NOT NULL AND p.id = _period)
            OR (_period IS NULL AND _date BETWEEN p.period_start_date AND p.period_end_date))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fin_bank_tx_in_locked_period(uuid, date, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_bank_tx_in_locked_period(uuid, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_bank_tx_lock_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND public.fin_bank_tx_in_locked_period(OLD.bank_account_id, OLD.transaction_date, OLD.statement_period_id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reconciled_at IS DISTINCT FROM OLD.reconciled_at
       OR NEW.suggested_classification_id IS DISTINCT FROM OLD.suggested_classification_id
       OR NEW.statement_period_id IS DISTINCT FROM OLD.statement_period_id
       OR NEW.ignored_reason IS DISTINCT FROM OLD.ignored_reason THEN
      RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND public.fin_bank_tx_in_locked_period(NEW.bank_account_id, NEW.transaction_date, NEW.statement_period_id) THEN
    RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.statement_period_id IS DISTINCT FROM OLD.statement_period_id
     AND public.fin_bank_tx_in_locked_period(NEW.bank_account_id, NEW.transaction_date, NEW.statement_period_id) THEN
    RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fin_bank_tx_lock_guard_trg ON public.bank_transactions;
CREATE TRIGGER fin_bank_tx_lock_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fin_bank_tx_lock_guard();

CREATE OR REPLACE FUNCTION public.fin_bank_link_lock_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ids uuid[];
  v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN v_ids := ARRAY[NEW.bank_transaction_id];
  ELSIF TG_OP = 'DELETE' THEN v_ids := ARRAY[OLD.bank_transaction_id];
  ELSE v_ids := ARRAY[OLD.bank_transaction_id, NEW.bank_transaction_id];
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    IF v_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bank_transactions bt
       WHERE bt.id = v_id
         AND public.fin_bank_tx_in_locked_period(bt.bank_account_id, bt.transaction_date, bt.statement_period_id)
    ) THEN
      RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fin_bank_link_lock_guard_trg ON public.financial_document_payments;
CREATE TRIGGER fin_bank_link_lock_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.financial_document_payments
  FOR EACH ROW EXECUTE FUNCTION public.fin_bank_link_lock_guard();
DROP TRIGGER IF EXISTS fin_bank_link_lock_guard_trg ON public.bank_transaction_classifications;
CREATE TRIGGER fin_bank_link_lock_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.bank_transaction_classifications
  FOR EACH ROW EXECUTE FUNCTION public.fin_bank_link_lock_guard();

CREATE OR REPLACE FUNCTION public.fin_period_window(_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
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
    SELECT bank_account_id INTO v_settle FROM public.payment_cards WHERE id = p.payment_card_id;
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
$$;
REVOKE EXECUTE ON FUNCTION public.fin_period_window(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_period_window(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_period_lock(_period_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  w jsonb;
  p public.bank_statement_periods%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.bank_statement_periods WHERE id = _period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p.locked_at IS NOT NULL THEN RETURN; END IF;
  w := public.fin_period_window(_period_id);
  IF (w->>'unmatched_count')::int > 0 THEN
    RAISE EXCEPTION 'period_has_unmatched' USING ERRCODE = '23514';
  END IF;
  IF abs((w->>'matched_difference')::numeric) > 0.005 THEN
    RAISE EXCEPTION 'period_difference_not_zero' USING ERRCODE = '23514';
  END IF;
  UPDATE public.bank_statement_periods SET locked_at = now(), locked_by = auth.uid(), updated_at = now() WHERE id = _period_id;
  INSERT INTO public.bank_statement_period_log(period_id, entity_id, action, actor)
  VALUES (_period_id, p.entity_id, 'locked', auth.uid());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_period_lock(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_period_lock(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_period_reopen(_period_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  p public.bank_statement_periods%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO p FROM public.bank_statement_periods WHERE id = _period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p.locked_at IS NULL THEN RETURN; END IF;
  UPDATE public.bank_statement_periods SET locked_at = NULL, locked_by = NULL, updated_at = now() WHERE id = _period_id;
  INSERT INTO public.bank_statement_period_log(period_id, entity_id, action, reason, actor)
  VALUES (_period_id, p.entity_id, 'reopened', btrim(_reason), auth.uid());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_period_reopen(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_period_reopen(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_reconcile_candidates(_tx_id uuid, _search text DEFAULT NULL)
RETURNS TABLE(kind text, ref_id uuid, label text, counterparty text, doc_date date, amount numeric, outstanding numeric, detail text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  t public.bank_transactions%ROWTYPE;
  s text := NULLIF(btrim(COALESCE(_search, '')), '');
  n numeric;
BEGIN
  SELECT * INTO t FROM public.bank_transactions WHERE id = _tx_id;
  IF NOT FOUND THEN RETURN; END IF;
  BEGIN n := replace(s, ',', '.')::numeric; EXCEPTION WHEN OTHERS THEN n := NULL; END;

  RETURN QUERY
  SELECT c.kind, c.ref_id, c.label, c.counterparty, c.doc_date, c.amount, c.outstanding, c.detail FROM (
    SELECT (CASE WHEN d.direction::text = 'issued' THEN 'sale' ELSE 'purchase' END)::text AS kind,
           d.id AS ref_id, COALESCE(d.document_number, '—')::text AS label, d.counterparty_name_snapshot::text AS counterparty,
           d.issue_date AS doc_date, d.total_inc_vat::numeric AS amount, d.outstanding_amount::numeric AS outstanding, d.doc_type::text AS detail
      FROM public.financial_documents d
     WHERE d.status::text NOT IN ('cancelled','paid')
       AND COALESCE(d.outstanding_amount, 0) > 0
       AND d.direction::text = CASE WHEN t.amount > 0 THEN 'issued' ELSE 'received' END
       AND (s IS NULL
            OR d.document_number ILIKE '%' || s || '%'
            OR d.counterparty_name_snapshot ILIKE '%' || s || '%'
            OR (n IS NOT NULL AND (abs(d.total_inc_vat - n) < 0.01 OR abs(d.outstanding_amount - n) < 0.01)))
    UNION ALL
    SELECT 'entrada'::text, q.id, COALESCE(q.extracted_document_number, q.original_filename, '—')::text,
           q.extracted_supplier_name::text, q.extracted_date, q.extracted_amount::numeric, q.extracted_amount::numeric,
           q.intake_route::text
      FROM public.financial_document_review_queue q
     WHERE q.status::text = 'pending_review'
       AND COALESCE(q.intake_route::text, '') <> 'bank'
       AND (s IS NULL
            OR q.extracted_document_number ILIKE '%' || s || '%'
            OR q.extracted_supplier_name ILIKE '%' || s || '%'
            OR q.original_filename ILIKE '%' || s || '%'
            OR (n IS NOT NULL AND abs(COALESCE(q.extracted_amount, -1) - n) < 0.01))
    UNION ALL
    SELECT 'reimbursement'::text, r.id, COALESCE(r.holder_name, '—')::text, r.holder_name::text, r.created_at::date,
           r.amount::numeric, r.amount::numeric, r.status::text
      FROM public.finance_holder_reimbursements r
     WHERE t.amount < 0 AND r.status NOT IN ('repaid','cancelled')
       AND (s IS NULL OR r.holder_name ILIKE '%' || s || '%' OR (n IS NOT NULL AND abs(r.amount - n) < 0.01))
    UNION ALL
    SELECT 'transfer'::text, o.id, a.account_name::text, a.bank_name::text, o.transaction_date, o.amount::numeric, NULL::numeric, o.description::text
      FROM public.bank_transactions o
      JOIN public.bank_accounts a ON a.id = o.bank_account_id
     WHERE o.bank_account_id <> t.bank_account_id
       AND abs(o.amount + t.amount) < 0.01
       AND o.transaction_date BETWEEN t.transaction_date - 5 AND t.transaction_date + 5
       AND (s IS NULL OR o.description ILIKE '%' || s || '%' OR a.account_name ILIKE '%' || s || '%' OR n IS NOT NULL)
  ) c
  ORDER BY
    CASE WHEN abs(abs(COALESCE(c.outstanding, c.amount, 0)) - abs(t.amount)) < 0.01 THEN 0 ELSE 1 END,
    abs(COALESCE(c.doc_date, t.transaction_date) - t.transaction_date)
  LIMIT 300;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_reconcile_candidates(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_reconcile_candidates(uuid, text) TO authenticated;