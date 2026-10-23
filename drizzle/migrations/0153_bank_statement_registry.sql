-- Stage A: bank document registry. Statement fields on the review queue (AI value kept,
-- corrections recorded), statement periods linked to their source document and card.
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS bank_doc_kind text,
  ADD COLUMN IF NOT EXISTS extracted_bank_name text,
  ADD COLUMN IF NOT EXISTS extracted_statement_number text,
  ADD COLUMN IF NOT EXISTS extracted_opening_balance numeric(14,2),
  ADD COLUMN IF NOT EXISTS extracted_closing_balance numeric(14,2),
  ADD COLUMN IF NOT EXISTS extracted_total_debits numeric(14,2),
  ADD COLUMN IF NOT EXISTS extracted_total_credits numeric(14,2),
  ADD COLUMN IF NOT EXISTS extracted_statement_card_last4 text,
  ADD COLUMN IF NOT EXISTS extracted_card_due_date date,
  ADD COLUMN IF NOT EXISTS extracted_card_amount_to_debit numeric(14,2),
  ADD COLUMN IF NOT EXISTS matched_payment_card_id uuid REFERENCES public.payment_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_identity_flag text,
  ADD COLUMN IF NOT EXISTS bank_ai_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bank_field_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS statement_period_id uuid REFERENCES public.bank_statement_periods(id) ON DELETE SET NULL;

ALTER TABLE public.financial_document_review_queue
  ADD CONSTRAINT fdrq_bank_doc_kind_ck CHECK (bank_doc_kind IS NULL OR bank_doc_kind IN ('account_statement','card_statement','bank_export','other_bank')),
  ADD CONSTRAINT fdrq_bank_identity_flag_ck CHECK (bank_identity_flag IS NULL OR bank_identity_flag IN ('unknown_account','unknown_card','card_without_card_account'));

COMMENT ON COLUMN public.financial_document_review_queue.bank_ai_values IS 'Values as read by the AI for bank statement fields; never overwritten by corrections.';
COMMENT ON COLUMN public.financial_document_review_queue.bank_field_overrides IS 'Per corrected field: {ai, previous, value, by, at}. The column itself holds the effective (corrected) value.';

CREATE INDEX IF NOT EXISTS fdrq_statement_period_idx ON public.financial_document_review_queue(statement_period_id);

ALTER TABLE public.bank_statement_periods
  ADD COLUMN IF NOT EXISTS source_queue_item_id uuid REFERENCES public.financial_document_review_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_card_id uuid REFERENCES public.payment_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid;

-- Create or update the statement period from a statement's (corrected) values.
CREATE OR REPLACE FUNCTION public.fin_bank_statement_sync_period(_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  q public.financial_document_review_queue%ROWTYPE;
  acc public.bank_accounts%ROWTYPE;
  p public.bank_statement_periods%ROWTYPE;
  v_num text;
BEGIN
  SELECT * INTO q FROM public.financial_document_review_queue WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF q.bank_doc_kind IS NULL OR q.bank_doc_kind NOT IN ('account_statement','card_statement') THEN
    RETURN NULL;
  END IF;
  IF q.matched_bank_account_id IS NULL OR q.extracted_period_start IS NULL OR q.extracted_period_end IS NULL
     OR q.extracted_opening_balance IS NULL OR q.extracted_closing_balance IS NULL THEN
    RAISE EXCEPTION 'statement_incomplete'
      USING ERRCODE = '23514', HINT = 'Account, period start/end, opening and closing balance are required.';
  END IF;
  SELECT * INTO acc FROM public.bank_accounts WHERE id = q.matched_bank_account_id;
  IF q.bank_doc_kind = 'card_statement' THEN
    IF q.matched_payment_card_id IS NULL THEN
      RAISE EXCEPTION 'card_required' USING ERRCODE = '23514';
    END IF;
    IF acc.account_kind IS DISTINCT FROM 'credit_card' THEN
      RAISE EXCEPTION 'card_account_required' USING ERRCODE = '23514';
    END IF;
  END IF;
  v_num := COALESCE(NULLIF(btrim(q.extracted_statement_number), ''), to_char(q.extracted_period_end, 'YYYY-MM'));

  IF q.statement_period_id IS NOT NULL THEN
    SELECT * INTO p FROM public.bank_statement_periods WHERE id = q.statement_period_id;
  END IF;
  IF p.id IS NULL THEN
    SELECT * INTO p FROM public.bank_statement_periods
     WHERE bank_account_id = acc.id AND period_start_date = q.extracted_period_start
       AND period_end_date = q.extracted_period_end
     LIMIT 1;
  END IF;
  IF p.id IS NULL THEN
    SELECT * INTO p FROM public.bank_statement_periods
     WHERE bank_account_id = acc.id AND statement_number = v_num LIMIT 1;
  END IF;

  IF p.id IS NOT NULL THEN
    IF p.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
    END IF;
    IF p.source_queue_item_id IS NOT NULL AND p.source_queue_item_id <> _id AND EXISTS (
         SELECT 1 FROM public.financial_document_review_queue o
          WHERE o.id = p.source_queue_item_id AND o.status NOT IN ('removed','rejected','duplicate')) THEN
      RAISE EXCEPTION 'duplicate_period' USING ERRCODE = '23505',
        DETAIL = p.source_queue_item_id::text,
        HINT = 'Another document is already the statement for this account and period.';
    END IF;
    UPDATE public.bank_statement_periods
       SET bank_account_id = acc.id,
           statement_number = v_num,
           period_start_date = q.extracted_period_start,
           period_end_date = q.extracted_period_end,
           opening_balance = q.extracted_opening_balance,
           closing_balance = q.extracted_closing_balance,
           payment_card_id = q.matched_payment_card_id,
           source_queue_item_id = _id
     WHERE id = p.id;
  ELSE
    INSERT INTO public.bank_statement_periods (
      entity_id, bank_account_id, statement_number, period_start_date, period_end_date,
      opening_balance, closing_balance, payment_card_id, source_queue_item_id, created_by)
    VALUES (acc.entity_id, acc.id, v_num, q.extracted_period_start, q.extracted_period_end,
      q.extracted_opening_balance, q.extracted_closing_balance, q.matched_payment_card_id, _id, auth.uid())
    RETURNING * INTO p;
  END IF;

  UPDATE public.financial_document_review_queue SET statement_period_id = p.id WHERE id = _id;
  RETURN p.id;
END;
$$;

-- Save corrected statement fields; the AI value stays in bank_ai_values.
CREATE OR REPLACE FUNCTION public.fin_bank_statement_save(_id uuid, _fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  q public.financial_document_review_queue%ROWTYPE;
  n public.financial_document_review_queue%ROWTYPE;
  k text;
  ov jsonb;
  v_locked timestamptz;
  allowed text[] := ARRAY['bank_doc_kind','extracted_statement_number','extracted_period_start',
    'extracted_period_end','extracted_opening_balance','extracted_closing_balance',
    'extracted_total_debits','extracted_total_credits','extracted_card_due_date',
    'extracted_card_amount_to_debit','matched_bank_account_id','matched_payment_card_id'];
BEGIN
  SELECT * INTO q FROM public.financial_document_review_queue WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF q.intake_route IS DISTINCT FROM 'bank' THEN RAISE EXCEPTION 'not_bank_document' USING ERRCODE = '23514'; END IF;
  IF q.statement_period_id IS NOT NULL THEN
    SELECT locked_at INTO v_locked FROM public.bank_statement_periods WHERE id = q.statement_period_id;
    IF v_locked IS NOT NULL THEN
      RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
    END IF;
  END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(_fields, '{}'::jsonb)) LOOP
    IF NOT (k = ANY (allowed)) THEN RAISE EXCEPTION 'field_not_editable: %', k USING ERRCODE = '22023'; END IF;
  END LOOP;

  n := jsonb_populate_record(q, COALESCE(_fields, '{}'::jsonb));
  ov := COALESCE(q.bank_field_overrides, '{}'::jsonb);
  FOR k IN SELECT jsonb_object_keys(COALESCE(_fields, '{}'::jsonb)) LOOP
    IF (to_jsonb(q) -> k) IS DISTINCT FROM (to_jsonb(n) -> k) THEN
      IF q.bank_ai_values ? k AND (q.bank_ai_values -> k) = (to_jsonb(n) -> k) THEN
        ov := ov - k; -- back to what the AI read
      ELSE
        ov := ov || jsonb_build_object(k, jsonb_build_object(
          'ai', q.bank_ai_values -> k, 'previous', to_jsonb(q) -> k,
          'value', to_jsonb(n) -> k, 'by', auth.uid(), 'at', now()));
      END IF;
    END IF;
  END LOOP;

  UPDATE public.financial_document_review_queue SET
    bank_doc_kind = n.bank_doc_kind,
    extracted_statement_number = n.extracted_statement_number,
    extracted_period_start = n.extracted_period_start,
    extracted_period_end = n.extracted_period_end,
    extracted_opening_balance = n.extracted_opening_balance,
    extracted_closing_balance = n.extracted_closing_balance,
    extracted_total_debits = n.extracted_total_debits,
    extracted_total_credits = n.extracted_total_credits,
    extracted_card_due_date = n.extracted_card_due_date,
    extracted_card_amount_to_debit = n.extracted_card_amount_to_debit,
    matched_bank_account_id = n.matched_bank_account_id,
    matched_payment_card_id = n.matched_payment_card_id,
    bank_identity_flag = CASE
      WHEN n.bank_doc_kind = 'card_statement' AND n.matched_payment_card_id IS NULL THEN 'unknown_card'
      WHEN n.bank_doc_kind IN ('account_statement','card_statement') AND n.matched_bank_account_id IS NULL THEN 'unknown_account'
      ELSE NULL END,
    bank_period = COALESCE(to_char(n.extracted_period_end, 'YYYY-MM'), q.bank_period),
    bank_field_overrides = ov
  WHERE id = _id;

  IF q.statement_period_id IS NOT NULL THEN
    PERFORM public.fin_bank_statement_sync_period(_id);
  END IF;
  RETURN jsonb_build_object('overrides', ov);
END;
$$;

-- Registry figures: Hub movements for each bank document's account and period.
CREATE OR REPLACE FUNCTION public.fin_bank_document_registry(_queue_item_id uuid DEFAULT NULL)
RETURNS TABLE(queue_item_id uuid, hub_total numeric, hub_count integer, hub_reconciled_count integer,
              first_tx date, last_tx date, period_locked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT q.id, m.total, COALESCE(m.cnt, 0), COALESCE(m.rec, 0), m.first_d, m.last_d, p.locked_at
    FROM public.financial_document_review_queue q
    LEFT JOIN public.bank_statement_periods p ON p.id = q.statement_period_id
    LEFT JOIN LATERAL (
      SELECT SUM(bt.amount) AS total, COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE bt.reconciled_at IS NOT NULL)::int AS rec,
             MIN(bt.transaction_date) AS first_d, MAX(bt.transaction_date) AS last_d
        FROM public.bank_transactions bt
       WHERE bt.bank_account_id = q.matched_bank_account_id
         AND ((q.statement_period_id IS NOT NULL AND bt.statement_period_id = q.statement_period_id)
              OR (bt.statement_period_id IS NULL
                  AND bt.transaction_date >= q.extracted_period_start
                  AND bt.transaction_date <= q.extracted_period_end))
    ) m ON q.matched_bank_account_id IS NOT NULL AND q.extracted_period_start IS NOT NULL AND q.extracted_period_end IS NOT NULL
   WHERE q.intake_route = 'bank'
     AND q.status IN ('pending_review','filed','duplicate')
     AND (_queue_item_id IS NULL OR q.id = _queue_item_id);
$$;

GRANT EXECUTE ON FUNCTION public.fin_bank_statement_sync_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_bank_statement_save(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_bank_document_registry(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_bank_statement_sync_period(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fin_bank_statement_save(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fin_bank_document_registry(uuid) FROM anon, public;
