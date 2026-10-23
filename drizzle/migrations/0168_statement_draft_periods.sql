-- Statement IDs (<code><MM>/<YYYY>[-n]), draft periods created at intake, bulk confirmation.
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS statement_code text;
UPDATE public.bank_accounts
   SET statement_code = upper(regexp_replace(regexp_replace(account_name, '^\s*\d+\s*', ''), '\s+', '', 'g'))
 WHERE statement_code IS NULL AND account_kind <> 'credit_card';
COMMENT ON COLUMN public.bank_accounts.statement_code IS 'Short code used in statement IDs (e.g. MBCP → MBCP06/2026).';

ALTER TABLE public.bank_statement_periods
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS bank_statement_number text,
  ADD COLUMN IF NOT EXISTS ai_readings jsonb,
  ADD COLUMN IF NOT EXISTS balance_disagreement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attached_documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;
ALTER TABLE public.bank_statement_periods DROP CONSTRAINT IF EXISTS bank_statement_periods_status_ck;
ALTER TABLE public.bank_statement_periods ADD CONSTRAINT bank_statement_periods_status_ck CHECK (status IN ('draft','confirmed'));
COMMENT ON COLUMN public.bank_statement_periods.statement_number IS 'Hub statement ID: account/card code + MM/YYYY (+ -n when a bank issues several in a month).';
COMMENT ON COLUMN public.bank_statement_periods.bank_statement_number IS 'Statement number printed by the bank (e.g. 006/2026).';

-- Rename the existing June period (ID only; balances untouched).
UPDATE public.bank_statement_periods
   SET bank_statement_number = COALESCE(bank_statement_number, statement_number),
       statement_number = 'MBCP06/2026'
 WHERE id = 'a76c5639-9d31-46c1-a7a0-5c5f5621638d' AND statement_number <> 'MBCP06/2026';

CREATE OR REPLACE FUNCTION public.fin_statement_base_code(_account_id uuid, _card_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _card_id IS NOT NULL THEN (
      SELECT CASE lower(c.network) WHEN 'visa' THEN 'VISA' WHEN 'mastercard' THEN 'MC' WHEN 'amex' THEN 'AMEX' ELSE 'CARD' END
             || COALESCE(c.last4, '')
        FROM public.payment_cards c WHERE c.id = _card_id)
    ELSE (SELECT COALESCE(NULLIF(a.statement_code, ''),
                 upper(regexp_replace(regexp_replace(a.account_name, '^\s*\d+\s*', ''), '\s+', '', 'g')))
            FROM public.bank_accounts a WHERE a.id = _account_id)
  END
$$;

-- Next free ID for an account/card + month. A second statement in the same month
-- renames an unlocked plain ID to -1 and takes -2 (then -3, ...).
CREATE OR REPLACE FUNCTION public.fin_statement_period_code(_account_id uuid, _card_id uuid, _end date, _self uuid)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  base text := public.fin_statement_base_code(_account_id, _card_id) || to_char(_end, 'MM/YYYY');
  n int;
  plain public.bank_statement_periods%ROWTYPE;
BEGIN
  SELECT count(*) INTO n FROM public.bank_statement_periods
   WHERE bank_account_id = _account_id AND id IS DISTINCT FROM _self
     AND (statement_number = base OR statement_number LIKE base || '-%');
  IF n = 0 THEN RETURN base; END IF;
  SELECT * INTO plain FROM public.bank_statement_periods
   WHERE bank_account_id = _account_id AND statement_number = base AND id IS DISTINCT FROM _self;
  IF plain.id IS NOT NULL AND plain.locked_at IS NULL THEN
    UPDATE public.bank_statement_periods SET statement_number = base || '-1' WHERE id = plain.id;
  END IF;
  RETURN base || '-' || (n + 1)::text;
END $$;

-- Create (draft) or attach the statement period for a statement read at intake.
-- _strict = true raises on incomplete/duplicate (used when a person confirms).
CREATE OR REPLACE FUNCTION public.fin_statement_draft_upsert(_id uuid, _strict boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q public.financial_document_review_queue%ROWTYPE;
  acc public.bank_accounts%ROWTYPE;
  p public.bank_statement_periods%ROWTYPE;
  fc jsonb; readings jsonb; disagree boolean; is_source boolean; diffs text[];
BEGIN
  SELECT * INTO q FROM public.financial_document_review_queue WHERE id = _id;
  IF NOT FOUND OR q.bank_doc_kind IS NULL OR q.bank_doc_kind NOT IN ('account_statement','card_statement')
     OR q.status IN ('removed','rejected','duplicate') THEN RETURN NULL; END IF;
  IF q.matched_bank_account_id IS NULL OR q.extracted_period_start IS NULL OR q.extracted_period_end IS NULL
     OR q.extracted_opening_balance IS NULL OR q.extracted_closing_balance IS NULL
     OR q.extracted_period_end < q.extracted_period_start THEN
    IF _strict THEN RAISE EXCEPTION 'statement_incomplete' USING ERRCODE = '23514',
      HINT = 'Account, period start/end, opening and closing balance are required.'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO acc FROM public.bank_accounts WHERE id = q.matched_bank_account_id;
  IF q.bank_doc_kind = 'card_statement' AND (q.matched_payment_card_id IS NULL OR acc.account_kind IS DISTINCT FROM 'credit_card') THEN
    IF _strict THEN RAISE EXCEPTION '%', CASE WHEN q.matched_payment_card_id IS NULL THEN 'card_required' ELSE 'card_account_required' END
      USING ERRCODE = '23514'; END IF;
    RETURN NULL;
  END IF;

  fc := COALESCE(q.field_checks, '{}'::jsonb);
  readings := jsonb_build_object(
    'opening', jsonb_build_object('claude', fc #> '{opening_balance,claude}', 'gemini', fc #> '{opening_balance,gemini}',
       'differ', COALESCE((fc #> '{opening_balance,reasons}') ? 'models_differ', false)),
    'closing', jsonb_build_object('claude', fc #> '{closing_balance,claude}', 'gemini', fc #> '{closing_balance,gemini}',
       'differ', COALESCE((fc #> '{closing_balance,reasons}') ? 'models_differ', false)));
  disagree := (readings #>> '{opening,differ}')::boolean OR (readings #>> '{closing,differ}')::boolean;

  IF q.statement_period_id IS NOT NULL THEN
    SELECT * INTO p FROM public.bank_statement_periods WHERE id = q.statement_period_id AND bank_account_id = acc.id;
  END IF;
  IF p.id IS NULL THEN
    SELECT * INTO p FROM public.bank_statement_periods
     WHERE bank_account_id = acc.id AND payment_card_id IS NOT DISTINCT FROM q.matched_payment_card_id
       AND daterange(period_start_date, period_end_date, '[]') && daterange(q.extracted_period_start, q.extracted_period_end, '[]')
     ORDER BY (period_start_date = q.extracted_period_start AND period_end_date = q.extracted_period_end) DESC, period_start_date
     LIMIT 1;
  END IF;

  IF p.id IS NULL THEN
    INSERT INTO public.bank_statement_periods (
      entity_id, bank_account_id, statement_number, bank_statement_number, period_start_date, period_end_date,
      opening_balance, closing_balance, payment_card_id, source_queue_item_id, status, ai_readings, balance_disagreement, created_by)
    VALUES (acc.entity_id, acc.id,
      public.fin_statement_period_code(acc.id, q.matched_payment_card_id, q.extracted_period_end, NULL),
      NULLIF(btrim(q.extracted_statement_number), ''), q.extracted_period_start, q.extracted_period_end,
      q.extracted_opening_balance, q.extracted_closing_balance, q.matched_payment_card_id, _id,
      'draft', readings, disagree, auth.uid())
    RETURNING * INTO p;
  ELSE
    is_source := p.source_queue_item_id IS NULL OR p.source_queue_item_id = _id OR NOT EXISTS (
      SELECT 1 FROM public.financial_document_review_queue o
       WHERE o.id = p.source_queue_item_id AND o.status NOT IN ('removed','rejected','duplicate'));
    IF is_source AND p.status = 'draft' AND p.locked_at IS NULL THEN
      UPDATE public.bank_statement_periods SET
        statement_number = CASE WHEN to_char(p.period_end_date, 'YYYY-MM') = to_char(q.extracted_period_end, 'YYYY-MM')
                                THEN p.statement_number
                                ELSE public.fin_statement_period_code(acc.id, q.matched_payment_card_id, q.extracted_period_end, p.id) END,
        bank_statement_number = NULLIF(btrim(q.extracted_statement_number), ''),
        period_start_date = q.extracted_period_start, period_end_date = q.extracted_period_end,
        opening_balance = q.extracted_opening_balance, closing_balance = q.extracted_closing_balance,
        payment_card_id = q.matched_payment_card_id, source_queue_item_id = _id,
        ai_readings = readings, balance_disagreement = disagree
      WHERE id = p.id;
    ELSE
      IF _strict AND NOT is_source THEN
        RAISE EXCEPTION 'duplicate_period' USING ERRCODE = '23505', DETAIL = p.source_queue_item_id::text,
          HINT = 'Another document is already the statement for this account and period.';
      END IF;
      diffs := ARRAY[]::text[];
      IF abs(p.opening_balance - q.extracted_opening_balance) > 0.005 THEN diffs := diffs || 'opening'; END IF;
      IF abs(p.closing_balance - q.extracted_closing_balance) > 0.005 THEN diffs := diffs || 'closing'; END IF;
      IF p.period_start_date <> q.extracted_period_start OR p.period_end_date <> q.extracted_period_end THEN diffs := diffs || 'dates'; END IF;
      UPDATE public.bank_statement_periods SET
        source_queue_item_id = CASE WHEN is_source THEN _id ELSE source_queue_item_id END,
        bank_statement_number = COALESCE(bank_statement_number, NULLIF(btrim(q.extracted_statement_number), '')),
        ai_readings = COALESCE(ai_readings, readings),
        attached_documents = attached_documents || jsonb_build_object(_id::text, jsonb_build_object(
          'opening', q.extracted_opening_balance, 'closing', q.extracted_closing_balance,
          'start', q.extracted_period_start, 'end', q.extracted_period_end,
          'readings', readings, 'differences', to_jsonb(diffs), 'at', now()))
      WHERE id = p.id;
    END IF;
  END IF;
  UPDATE public.financial_document_review_queue SET statement_period_id = p.id
   WHERE id = _id AND statement_period_id IS DISTINCT FROM p.id;
  RETURN p.id;
END $$;
REVOKE ALL ON FUNCTION public.fin_statement_draft_upsert(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_statement_draft_upsert(uuid, boolean) TO authenticated, service_role;

-- Intake hook: never blocks a read; a removed/duplicate source drops its untouched draft.
CREATE OR REPLACE FUNCTION public.fin_statement_draft_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('removed','rejected','duplicate') THEN
    IF NEW.statement_period_id IS NOT NULL THEN
      DELETE FROM public.bank_statement_periods p
       WHERE p.id = NEW.statement_period_id AND p.status = 'draft' AND p.locked_at IS NULL
         AND p.source_queue_item_id = NEW.id AND p.attached_documents = '{}'::jsonb
         AND NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.statement_period_id = p.id);
    END IF;
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.fin_statement_draft_upsert(NEW.id, false);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'statement draft skipped for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_fdrq_statement_draft ON public.financial_document_review_queue;
CREATE TRIGGER zz_fdrq_statement_draft
  AFTER INSERT OR UPDATE OF bank_doc_kind, matched_bank_account_id, matched_payment_card_id, extracted_period_start,
    extracted_period_end, extracted_opening_balance, extracted_closing_balance, field_checks, status, intake_route
  ON public.financial_document_review_queue
  FOR EACH ROW WHEN (NEW.intake_route = 'bank' AND NEW.bank_doc_kind IN ('account_statement','card_statement'))
  EXECUTE FUNCTION public.fin_statement_draft_trg();

-- Confirming a statement (Entrada filing) turns its period into a confirmed one.
CREATE OR REPLACE FUNCTION public.fin_bank_statement_sync_period(_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  q public.financial_document_review_queue%ROWTYPE;
  v_pid uuid;
  p public.bank_statement_periods%ROWTYPE;
BEGIN
  SELECT * INTO q FROM public.financial_document_review_queue WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF q.bank_doc_kind IS NULL OR q.bank_doc_kind NOT IN ('account_statement','card_statement') THEN RETURN NULL; END IF;
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_pid := public.fin_statement_draft_upsert(_id, true);
  SELECT * INTO p FROM public.bank_statement_periods WHERE id = v_pid;
  IF p.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'period_locked' USING ERRCODE = '23514', HINT = 'Reopen the statement period with a reason first.';
  END IF;
  UPDATE public.bank_statement_periods SET
    period_start_date = q.extracted_period_start, period_end_date = q.extracted_period_end,
    opening_balance = q.extracted_opening_balance, closing_balance = q.extracted_closing_balance,
    payment_card_id = q.matched_payment_card_id,
    bank_statement_number = COALESCE(NULLIF(btrim(q.extracted_statement_number), ''), bank_statement_number),
    status = 'confirmed',
    confirmed_at = COALESCE(confirmed_at, now()), confirmed_by = COALESCE(confirmed_by, auth.uid())
  WHERE id = v_pid AND source_queue_item_id = _id;
  RETURN v_pid;
END $$;

-- A draft cannot be locked as reconciled.
CREATE OR REPLACE FUNCTION public.fin_period_lock(_period_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
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
  IF p.status = 'draft' THEN
    RAISE EXCEPTION 'period_is_draft' USING ERRCODE = '23514', HINT = 'Confirm the statement first.';
  END IF;
  w := public.fin_period_window(_period_id);
  IF (w->>'unmatched_count')::int > 0 THEN
    RAISE EXCEPTION 'period_has_unmatched' USING ERRCODE = '23514';
  END IF;
  IF abs((w->>'matched_difference')::numeric) > 0.005 THEN
    RAISE EXCEPTION 'period_difference_not_zero' USING ERRCODE = '23514';
  END IF;
  UPDATE public.bank_statement_periods SET locked_at = now(), locked_by = auth.uid(), updated_at = now() WHERE id = _period_id;
  PERFORM public.fin_period_log_write(_period_id, 'locked', NULL);
END $$;
