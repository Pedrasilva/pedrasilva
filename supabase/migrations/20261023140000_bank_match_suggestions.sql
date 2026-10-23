-- Stage C: ranked reconciliation suggestions, learned description rules, open balances.
ALTER TABLE public.bank_classification_rules
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS learned_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_learned_at timestamptz;
ALTER TABLE public.bank_classification_rules DROP CONSTRAINT IF EXISTS bcr_source_chk;
ALTER TABLE public.bank_classification_rules ADD CONSTRAINT bcr_source_chk CHECK (source IN ('manual','learned'));
COMMENT ON COLUMN public.bank_classification_rules.supplier_id IS 'Supplier/client the description points to (learned from confirmed matches or set by hand); ranking signal only.';

-- Normalised description key: words without digits, 3+ letters ("MDB8022 LOVABLE 300.00EUR" -> "lovable").
CREATE OR REPLACE FUNCTION public.fin_desc_key(_d text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(COALESCE(_d,'')),
    '\S*\d\S*', ' ', 'g'), '[^a-zà-ÿ]+', ' ', 'g'), '(^| )[a-zà-ÿ]{1,2}(?= |$)', ' ', 'g'), '\s+', ' ', 'g')), '')
$$;
-- First meaningful word of a counterparty name ("Lovable Labs Incorporated" -> "lovable").
CREATE OR REPLACE FUNCTION public.fin_name_key(_n text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT substring(lower(COALESCE(_n,'')) FROM '[a-zà-ÿ]{3,}')
$$;

-- Amount of a movement not yet allocated to documents (split/partial payments).
CREATE OR REPLACE FUNCTION public.fin_tx_open_balance(_tx_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT round(abs(t.amount) - COALESCE((SELECT sum(p.amount) FROM public.financial_document_payments p WHERE p.bank_transaction_id = t.id), 0), 2)
    FROM public.bank_transactions t WHERE t.id = _tx_id
$$;
REVOKE EXECUTE ON FUNCTION public.fin_tx_open_balance(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_tx_open_balance(uuid) TO authenticated;

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
  WITH base AS (
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
      ((SELECT count(*) FROM public.financial_documents h
         WHERE h.entity_id = t.entity_id AND h.status::text = 'paid' AND h.id <> s.ref_id
           AND abs(h.total_inc_vat - s.amount) < 0.01
           AND ((s.party IS NOT NULL AND COALESCE(h.counterparty_supplier_id, h.counterparty_client_id) = s.party)
             OR (s.nk IS NOT NULL AND public.fin_name_key(h.counterparty_name_snapshot) = s.nk))) >= 2) AS by_recurring
      FROM scored s
  ), total AS (
    SELECT g.*,
      g.s_amount
      + least(30, (CASE WHEN g.by_rule THEN 25 ELSE 0 END) + (CASE WHEN g.by_past THEN 20 ELSE 0 END) + (CASE WHEN g.by_name THEN 18 ELSE 0 END))
      + (CASE WHEN g.by_ref THEN 25 ELSE 0 END)
      + (CASE WHEN g.by_recurring THEN 10 ELSE 0 END)
      + (CASE WHEN g.days IS NULL THEN 0 WHEN g.days BETWEEN 0 AND 60 THEN 15 - g.days / 6 WHEN g.days BETWEEN -30 AND -1 THEN 5 ELSE 3 END) AS score
      FROM sig g
  )
  SELECT x.kind, x.ref_id, x.label, x.counterparty, x.doc_date, x.amount, x.outstanding,
         least(99, x.score)::int,
         jsonb_strip_nulls(jsonb_build_array(
           jsonb_build_object('code', CASE WHEN x.diff < 0.01 THEN 'amount_exact' WHEN x.diff <= greatest(2, 0.03 * v_open) THEN 'amount_fee'
                                           WHEN x.outstanding > v_open THEN 'partial_doc' ELSE 'split_tx' END, 'diff', round(x.diff, 2)),
           CASE WHEN x.by_rule THEN jsonb_build_object('code','rule') END,
           CASE WHEN x.by_past THEN jsonb_build_object('code','past') END,
           CASE WHEN x.by_name AND NOT x.by_past THEN jsonb_build_object('code','name') END,
           CASE WHEN x.by_ref THEN jsonb_build_object('code','reference') END,
           CASE WHEN x.by_recurring THEN jsonb_build_object('code','recurring') END,
           CASE WHEN x.days IS NOT NULL THEN jsonb_build_object('code','days','days', x.days) END
         )) - 'null',
         round(least(x.outstanding, v_open), 2), v_open
    FROM total x
   WHERE x.s_amount >= 28 OR x.by_rule OR x.by_past OR x.by_name OR x.by_ref
   ORDER BY x.score DESC, abs(COALESCE(x.days, 999)) ASC
   LIMIT 5;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_reconcile_suggestions(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_reconcile_suggestions(uuid) TO authenticated;

-- Learn "description -> supplier/category" from a confirmed match. Admin only (rules are admin-written); others: no-op.
CREATE OR REPLACE FUNCTION public.fin_learn_match_rule(_tx_id uuid, _doc_id uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  t public.bank_transactions%ROWTYPE; d public.financial_documents%ROWTYPE;
  v_key text; v_party uuid; v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.bank_transactions WHERE id = _tx_id;
  SELECT * INTO d FROM public.financial_documents WHERE id = _doc_id;
  IF t.id IS NULL OR d.id IS NULL OR t.entity_id <> d.entity_id THEN RETURN NULL; END IF;
  v_key := public.fin_desc_key(t.description);
  v_party := COALESCE(d.counterparty_supplier_id, d.counterparty_client_id);
  IF v_key IS NULL OR length(v_key) < 3 OR (v_party IS NULL AND d.classification_id IS NULL) THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.bank_classification_rules
   WHERE entity_id = t.entity_id AND match_type = 'contains' AND lower(pattern) = v_key LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.bank_classification_rules(entity_id, name, match_type, pattern, case_sensitive, classification_id, supplier_id,
                                                 needs_review, priority, active, source, learned_count, last_learned_at)
    VALUES (t.entity_id, 'Aprendida: ' || v_key, 'contains', v_key, false, d.classification_id, v_party,
            true, 500, true, 'learned', 1, now())
    RETURNING id INTO v_id;
  ELSE
    -- Learned rules follow the latest confirmation; manual rules only gain missing values.
    UPDATE public.bank_classification_rules r
       SET supplier_id = CASE WHEN r.source = 'learned' THEN COALESCE(v_party, r.supplier_id) ELSE COALESCE(r.supplier_id, v_party) END,
           classification_id = CASE WHEN r.source = 'learned' THEN COALESCE(d.classification_id, r.classification_id) ELSE COALESCE(r.classification_id, d.classification_id) END,
           learned_count = r.learned_count + 1, last_learned_at = now(), updated_at = now()
     WHERE r.id = v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fin_learn_match_rule(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_learn_match_rule(uuid, uuid) TO authenticated;