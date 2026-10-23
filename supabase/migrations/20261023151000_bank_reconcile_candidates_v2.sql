-- Matching panel: one candidate pool scoped to the movement's company and direction, sorted by amount closeness,
-- with the origin of each row (purchase / issued invoice / project / Entrada / HR / transfer) and no repeated Entrada copies.
DROP FUNCTION IF EXISTS public.fin_reconcile_candidates(uuid, text);
CREATE FUNCTION public.fin_reconcile_candidates(_tx_id uuid, _search text DEFAULT NULL)
RETURNS TABLE(kind text, ref_id uuid, label text, counterparty text, doc_date date, amount numeric, outstanding numeric, detail text, origin text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  t public.bank_transactions%ROWTYPE;
  s text := NULLIF(btrim(COALESCE(_search, '')), '');
  n numeric;
  v_open numeric;
BEGIN
  SELECT * INTO t FROM public.bank_transactions WHERE id = _tx_id;
  IF NOT FOUND THEN RETURN; END IF;
  BEGIN n := replace(s, ',', '.')::numeric; EXCEPTION WHEN OTHERS THEN n := NULL; END;
  v_open := COALESCE(public.fin_tx_open_balance(_tx_id), abs(t.amount));

  RETURN QUERY
  SELECT c.kind, c.ref_id, c.label, c.counterparty, c.doc_date, c.amount, c.outstanding, c.detail, c.origin FROM (
    SELECT (CASE WHEN d.direction::text = 'issued' THEN 'sale' ELSE 'purchase' END)::text AS kind,
           d.id AS ref_id, COALESCE(d.document_number, '—')::text AS label, d.counterparty_name_snapshot::text AS counterparty,
           d.issue_date AS doc_date, d.total_inc_vat::numeric AS amount, d.outstanding_amount::numeric AS outstanding, d.doc_type::text AS detail,
           (CASE WHEN d.direction::text = 'issued' THEN 'sale' WHEN d.project_id IS NOT NULL THEN 'project' ELSE 'purchase' END)::text AS origin
      FROM public.financial_documents d
     WHERE d.entity_id = t.entity_id
       AND d.status::text NOT IN ('cancelled','paid')
       AND COALESCE(d.outstanding_amount, 0) > 0
       AND d.direction::text = CASE WHEN t.amount > 0 THEN 'issued' ELSE 'received' END
       AND (s IS NULL
            OR d.document_number ILIKE '%' || s || '%'
            OR d.counterparty_name_snapshot ILIKE '%' || s || '%'
            OR d.notes ILIKE '%' || s || '%'
            OR (n IS NOT NULL AND (abs(d.total_inc_vat - n) < 0.01 OR abs(d.outstanding_amount - n) < 0.01)))
    UNION ALL
    (SELECT DISTINCT ON (lower(COALESCE(q.extracted_supplier_name, '')), COALESCE(q.extracted_document_number, q.original_filename), q.extracted_amount)
           'entrada'::text, q.id, COALESCE(q.extracted_document_number, q.original_filename, '—')::text,
           COALESCE(q.extracted_supplier_name, q.extracted_buyer_name)::text, q.extracted_date, q.extracted_amount::numeric, q.extracted_amount::numeric,
           q.intake_route::text, 'entrada'::text
      FROM public.financial_document_review_queue q
     WHERE q.entity_id = t.entity_id
       AND q.status::text = 'pending_review'
       AND COALESCE(q.intake_route::text, '') <> 'bank'
       AND q.created_expense_id IS NULL AND q.duplicate_of_document_id IS NULL
       AND COALESCE(q.direction::text, 'unclear') IN ('unclear', CASE WHEN t.amount > 0 THEN 'issued' ELSE 'received' END)
       AND (s IS NULL
            OR q.extracted_document_number ILIKE '%' || s || '%'
            OR q.extracted_supplier_name ILIKE '%' || s || '%'
            OR q.extracted_buyer_name ILIKE '%' || s || '%'
            OR q.original_filename ILIKE '%' || s || '%'
            OR (n IS NOT NULL AND abs(COALESCE(q.extracted_amount, -1) - n) < 0.01))
     ORDER BY lower(COALESCE(q.extracted_supplier_name, '')), COALESCE(q.extracted_document_number, q.original_filename), q.extracted_amount, q.created_at)
    UNION ALL
    SELECT 'reimbursement'::text, r.id, COALESCE(r.holder_name, '—')::text, r.holder_name::text, r.created_at::date,
           r.amount::numeric, r.amount::numeric, r.status::text, 'hr'::text
      FROM public.finance_holder_reimbursements r
     WHERE t.amount < 0 AND r.entity_id = t.entity_id AND r.status NOT IN ('repaid','cancelled')
       AND (s IS NULL OR r.holder_name ILIKE '%' || s || '%' OR (n IS NOT NULL AND abs(r.amount - n) < 0.01))
    UNION ALL
    SELECT 'transfer'::text, o.id, a.account_name::text, a.bank_name::text, o.transaction_date, o.amount::numeric, NULL::numeric, o.description::text, 'transfer'::text
      FROM public.bank_transactions o
      JOIN public.bank_accounts a ON a.id = o.bank_account_id
     WHERE o.bank_account_id <> t.bank_account_id
       AND abs(o.amount + t.amount) < 0.01
       AND o.transaction_date BETWEEN t.transaction_date - 5 AND t.transaction_date + 5
       AND (s IS NULL OR o.description ILIKE '%' || s || '%' OR a.account_name ILIKE '%' || s || '%' OR n IS NOT NULL)
  ) c
  ORDER BY abs(abs(COALESCE(c.outstanding, c.amount, 0)) - v_open),
           abs(COALESCE(c.doc_date, t.transaction_date) - t.transaction_date)
  LIMIT 300;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_reconcile_candidates(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_reconcile_candidates(uuid, text) TO authenticated;