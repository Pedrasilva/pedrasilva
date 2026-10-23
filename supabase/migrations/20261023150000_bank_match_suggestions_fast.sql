-- Matching UX fix: the paid-history (recurring) signal is computed once per call, not once per candidate.
-- Before: ~15 s on movements with many candidates (e.g. APPLE.COM 23,49), so the panel timed out and showed no suggestions.
CREATE OR REPLACE FUNCTION public.fin_reconcile_suggestions(_tx_id uuid)
RETURNS TABLE(kind text, ref_id uuid, label text, counterparty text, doc_date date, amount numeric, outstanding numeric,
              confidence integer, reasons jsonb, suggested_amount numeric, tx_open numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  t public.bank_transactions%ROWTYPE;
  v_open numeric; v_key text; v_ref text;
  v_rule_sup uuid[]; v_past_sup uuid[]; v_past_names text[];
BEGIN
  SELECT * INTO t FROM public.bank_transactions WHERE id = _tx_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_open := public.fin_tx_open_balance(_tx_id);
  IF v_open IS NULL OR v_open <= 0.005 THEN RETURN; END IF;
  v_key := public.fin_desc_key(t.description);
  v_ref := regexp_replace(lower(t.description), '[^a-z0-9]', '', 'g');

  SELECT array_agg(DISTINCT r.supplier_id) INTO v_rule_sup
    FROM public.bank_classification_rules r
   WHERE r.active AND r.supplier_id IS NOT NULL AND r.entity_id = t.entity_id
     AND CASE r.match_type::text
           WHEN 'contains' THEN lower(t.description) LIKE '%' || lower(r.pattern) || '%' OR (v_key IS NOT NULL AND v_key LIKE '%' || lower(r.pattern) || '%')
           WHEN 'starts_with' THEN lower(t.description) LIKE lower(r.pattern) || '%'
           WHEN 'ends_with' THEN lower(t.description) LIKE '%' || lower(r.pattern)
           WHEN 'equals' THEN lower(t.description) = lower(r.pattern)
           ELSE false END;

  IF v_key IS NOT NULL THEN
    SELECT array_agg(DISTINCT COALESCE(d.counterparty_supplier_id, d.counterparty_client_id)) FILTER (WHERE COALESCE(d.counterparty_supplier_id, d.counterparty_client_id) IS NOT NULL),
           array_agg(DISTINCT public.fin_name_key(d.counterparty_name_snapshot)) FILTER (WHERE public.fin_name_key(d.counterparty_name_snapshot) IS NOT NULL)
      INTO v_past_sup, v_past_names
      FROM public.bank_transactions o
      JOIN public.financial_document_payments p ON p.bank_transaction_id = o.id
      JOIN public.financial_documents d ON d.id = p.document_id
     WHERE o.id <> t.id AND o.entity_id = t.entity_id AND public.fin_desc_key(o.description) = v_key;
  END IF;

  RETURN QUERY
  WITH base AS MATERIALIZED (
    SELECT (CASE WHEN d.direction::text = 'issued' THEN 'sale' ELSE 'purchase' END)::text AS kind, d.id AS ref_id,
           COALESCE(d.document_number, '—')::text AS label, d.counterparty_name_snapshot::text AS counterparty, d.issue_date AS doc_date,
           d.total_inc_vat::numeric AS amount, d.outstanding_amount::numeric AS outstanding,
           COALESCE(d.counterparty_supplier_id, d.counterparty_client_id) AS party, d.document_number AS docno
      FROM public.financial_documents d
     WHERE d.entity_id = t.entity_id
       AND d.status::text NOT IN ('cancelled','paid') AND COALESCE(d.outstanding_amount, 0) > 0
       AND d.direction::text = CASE WHEN t.amount > 0 THEN 'issued' ELSE 'received' END
       AND (d.issue_date IS NULL OR d.issue_date BETWEEN t.transaction_date - 180 AND t.transaction_date + 30)
    UNION ALL
    SELECT 'entrada', q.id, COALESCE(q.extracted_document_number, q.original_filename, '—')::text,
           COALESCE(q.extracted_supplier_name, q.extracted_buyer_name)::text, q.extracted_date,
           q.extracted_amount::numeric, q.extracted_amount::numeric,
           COALESCE(q.matched_supplier_id, q.matched_client_id), q.extracted_document_number
      FROM public.financial_document_review_queue q
     WHERE q.entity_id = t.entity_id AND q.status::text = 'pending_review'
       AND COALESCE(q.intake_route::text, '') <> 'bank' AND COALESCE(q.extracted_amount, 0) > 0
       AND (q.extracted_date IS NULL OR q.extracted_date BETWEEN t.transaction_date - 180 AND t.transaction_date + 30)
  ), hist AS MATERIALIZED (
    SELECT round(h.total_inc_vat, 2) AS amt, COALESCE(h.counterparty_supplier_id, h.counterparty_client_id) AS party,
           public.fin_name_key(h.counterparty_name_snapshot) AS nk, h.id
      FROM public.financial_documents h
     WHERE h.entity_id = t.entity_id AND h.status::text = 'paid'
  ), scored AS (
    SELECT b.*,
      abs(b.outstanding - v_open) AS diff,
      (t.transaction_date - b.doc_date) AS days,
      public.fin_name_key(b.counterparty) AS nk,
      NULLIF(regexp_replace(lower(COALESCE(b.docno,'')), '[^a-z0-9]', '', 'g'), '') AS docref
      FROM base b
  ), sig AS (
    SELECT s.*,
      CASE WHEN s.diff < 0.01 THEN 40
           WHEN s.diff <= greatest(2, 0.03 * v_open) THEN 28
           WHEN s.outstanding > v_open THEN 12
           ELSE 10 END AS s_amount,
      (s.party IS NOT NULL AND s.party = ANY(COALESCE(v_rule_sup, '{}'))) AS by_rule,
      ((s.party IS NOT NULL AND s.party = ANY(COALESCE(v_past_sup, '{}'))) OR (s.nk IS NOT NULL AND s.nk = ANY(COALESCE(v_past_names, '{}')))) AS by_past,
      (s.nk IS NOT NULL AND v_key IS NOT NULL AND (' ' || v_key || ' ') LIKE '% ' || s.nk || ' %') AS by_name,
      (s.docref IS NOT NULL AND length(s.docref) >= 4 AND position(s.docref IN v_ref) > 0) AS by_ref,
      ((SELECT count(*) FROM hist h WHERE h.amt = round(s.amount, 2) AND h.id <> s.ref_id
         AND ((s.party IS NOT NULL AND h.party = s.party) OR (s.nk IS NOT NULL AND h.nk = s.nk))) >= 2) AS by_recurring
      FROM scored s
  ), total AS (
    SELECT g.*,
      g.s_amount
      + least(30, (CASE WHEN g.by_rule THEN 25 ELSE 0 END) + (CASE WHEN g.by_past THEN 20 ELSE 0 END) + (CASE WHEN g.by_name THEN 18 ELSE 0 END))
      + (CASE WHEN g.by_ref THEN 25 ELSE 0 END)
      + (CASE WHEN g.by_recurring THEN 10 ELSE 0 END)
      - (CASE WHEN g.kind = 'entrada' THEN 10 ELSE 0 END)
      + (CASE WHEN g.days IS NULL THEN 0 WHEN g.days BETWEEN 0 AND 60 THEN 15 - g.days / 6 WHEN g.days BETWEEN -30 AND -1 THEN 5 ELSE 3 END) AS score
      FROM sig g
  )
  SELECT x.kind, x.ref_id, x.label, x.counterparty, x.doc_date, x.amount, x.outstanding,
         least(99, x.score)::int,
         jsonb_path_query_array(jsonb_build_array(
           jsonb_build_object('code', CASE WHEN x.diff < 0.01 THEN 'amount_exact' WHEN x.diff <= greatest(2, 0.03 * v_open) THEN 'amount_fee'
                                           WHEN x.outstanding > v_open THEN 'partial_doc' ELSE 'split_tx' END, 'diff', round(x.diff, 2)),
           CASE WHEN x.by_rule THEN jsonb_build_object('code','rule') END,
           CASE WHEN x.by_past THEN jsonb_build_object('code','past') END,
           CASE WHEN x.by_name AND NOT x.by_past THEN jsonb_build_object('code','name') END,
           CASE WHEN x.by_ref THEN jsonb_build_object('code','reference') END,
           CASE WHEN x.by_recurring THEN jsonb_build_object('code','recurring') END,
           CASE WHEN x.days IS NOT NULL THEN jsonb_build_object('code','days','days', x.days) END
         ), '$[*] ? (@ != null)'),
         round(least(x.outstanding, v_open), 2), v_open
    FROM total x
   WHERE x.s_amount >= 28 OR x.by_rule OR x.by_past OR x.by_name OR x.by_ref
   ORDER BY x.score DESC, abs(COALESCE(x.days, 999)) ASC
   LIMIT 5;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_reconcile_suggestions(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_reconcile_suggestions(uuid) TO authenticated;