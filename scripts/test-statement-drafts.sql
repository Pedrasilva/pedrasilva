-- Draft statement periods + statement IDs — disposable, fully rolled back.
-- Run through the database query tool as the admin user under the authenticated role.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"ab5a48c0-939b-4502-bd3b-db7801f0f8b8","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $T$
DECLARE
  psa uuid := '00000000-0000-4000-a000-000000000001';
  acc uuid; cc uuid; card uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; qc uuid;
  p1 uuid; p uuid; v record; ok boolean;
  fc jsonb := '{"opening_balance":{"status":"verify","value":1000,"claude":1000,"gemini":1100,"reasons":["models_differ"]},
                "closing_balance":{"status":"ok","value":800,"claude":800,"gemini":800,"reasons":[]}}';
BEGIN
  INSERT INTO public.finance_entity_preferences(user_id, entity_id) VALUES (auth.uid(), psa)
    ON CONFLICT (user_id) DO UPDATE SET entity_id = psa;
  INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind, statement_code)
    VALUES (psa, 'TEST-DRAFT conta', 'TESTBANK', 'EUR', true, 'bank', 'TST') RETURNING id INTO acc;
  INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind, settles_from_account_id)
    VALUES (psa, 'TEST-DRAFT cartão', 'TESTBANK', 'EUR', true, 'credit_card', acc) RETURNING id INTO cc;
  INSERT INTO public.payment_cards(entity_id, holder_name, last4, network, card_type, bank_account_id)
    VALUES (psa, 'TEST-DRAFT', '1234', 'visa', 'credit', cc) RETURNING id INTO card;

  -- 1. Intake read → draft created automatically, models disagree on opening.
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_statement_number, extracted_period_start, extracted_period_end,
    extracted_opening_balance, extracted_closing_balance, field_checks)
  VALUES (psa, 'test-draft/jun.pdf', 'bank', 'pending_review', 'bank_statement', 'account_statement', acc,
    '006/2026', '2026-06-01', '2026-06-30', 1000, 800, fc) RETURNING id INTO q1;
  SELECT * INTO v FROM public.bank_statement_periods WHERE source_queue_item_id = q1;
  IF v.id IS NULL THEN RAISE EXCEPTION 'FAIL draft not created'; END IF;
  p1 := v.id;
  IF v.status <> 'draft' OR v.statement_number <> 'TST06/2026' OR v.bank_statement_number <> '006/2026'
     OR v.opening_balance <> 1000 OR v.closing_balance <> 800 OR NOT v.balance_disagreement
     OR (v.ai_readings #>> '{opening,gemini}')::numeric <> 1100 THEN RAISE EXCEPTION 'FAIL draft values %', row_to_json(v); END IF;
  IF (SELECT statement_period_id FROM public.financial_document_review_queue WHERE id = q1) <> p1 THEN RAISE EXCEPTION 'FAIL PDF link'; END IF;

  -- 2. A draft cannot be locked.
  ok := false;
  BEGIN PERFORM public.fin_period_lock(p1); EXCEPTION WHEN check_violation THEN ok := SQLERRM = 'period_is_draft'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL draft locked'; END IF;

  -- 3. Correction keeps AI value + who/when; draft follows.
  UPDATE public.financial_document_review_queue SET bank_ai_values = '{"extracted_opening_balance":1000}' WHERE id = q1;
  PERFORM public.fin_bank_statement_save(q1, '{"extracted_opening_balance": 1050}');
  IF (SELECT opening_balance FROM public.bank_statement_periods WHERE id = p1) <> 1050 THEN RAISE EXCEPTION 'FAIL draft not following correction'; END IF;
  IF (SELECT bank_field_overrides #>> '{extracted_opening_balance,ai}' FROM public.financial_document_review_queue WHERE id = q1) <> '1000'
    THEN RAISE EXCEPTION 'FAIL AI value lost'; END IF;

  -- 4. Same account + month again → attached to the same period, differences flagged, no new period.
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_period_start, extracted_period_end, extracted_opening_balance, extracted_closing_balance)
  VALUES (psa, 'test-draft/jun-copy.pdf', 'bank', 'pending_review', 'bank_statement', 'account_statement', acc,
    '2026-06-01', '2026-06-30', 1050, 900) RETURNING id INTO q2;
  IF (SELECT count(*) FROM public.bank_statement_periods WHERE bank_account_id = acc) <> 1 THEN RAISE EXCEPTION 'FAIL duplicate period'; END IF;
  IF (SELECT statement_period_id FROM public.financial_document_review_queue WHERE id = q2) <> p1 THEN RAISE EXCEPTION 'FAIL not attached'; END IF;
  IF (SELECT attached_documents -> q2::text -> 'differences' FROM public.bank_statement_periods WHERE id = p1) <> '["closing"]'::jsonb
    THEN RAISE EXCEPTION 'FAIL difference flag'; END IF;

  -- 5. Confirming the first statement → confirmed; then it can be locked (no movements).
  PERFORM public.fin_bank_statement_sync_period(q1);
  SELECT * INTO v FROM public.bank_statement_periods WHERE id = p1;
  IF v.status <> 'confirmed' OR v.confirmed_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FAIL confirm'; END IF;
  -- The attached second copy cannot also become the statement.
  ok := false;
  BEGIN PERFORM public.fin_bank_statement_sync_period(q2); EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL second statement accepted'; END IF;

  -- 6. Two statements in one month → -1 / -2.
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_period_start, extracted_period_end, extracted_opening_balance, extracted_closing_balance)
  VALUES (psa, 'test-draft/jul-a.pdf', 'bank', 'pending_review', 'bank_statement', 'account_statement', acc,
    '2026-07-01', '2026-07-15', 800, 700) RETURNING id INTO q3;
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_period_start, extracted_period_end, extracted_opening_balance, extracted_closing_balance)
  VALUES (psa, 'test-draft/jul-b.pdf', 'bank', 'pending_review', 'bank_statement', 'account_statement', acc,
    '2026-07-16', '2026-07-31', 700, 650) RETURNING id INTO q4;
  IF (SELECT statement_number FROM public.bank_statement_periods WHERE source_queue_item_id = q3) <> 'TST07/2026-1'
     OR (SELECT statement_number FROM public.bank_statement_periods WHERE source_queue_item_id = q4) <> 'TST07/2026-2'
    THEN RAISE EXCEPTION 'FAIL suffixes'; END IF;

  -- 7. Card statement → card code.
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, matched_payment_card_id, extracted_period_start, extracted_period_end,
    extracted_opening_balance, extracted_closing_balance)
  VALUES (psa, 'test-draft/card.pdf', 'bank', 'pending_review', 'bank_statement', 'card_statement', cc, card,
    '2026-05-16', '2026-06-15', -100, -250) RETURNING id INTO qc;
  IF (SELECT statement_number FROM public.bank_statement_periods WHERE source_queue_item_id = qc) <> 'VISA123406/2026'
    THEN RAISE EXCEPTION 'FAIL card code'; END IF;

  -- 8. Incomplete read → no draft, intake not blocked; removing a source drops its draft.
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_period_start, extracted_period_end)
  VALUES (psa, 'test-draft/incomplete.pdf', 'bank', 'pending_review', 'bank_statement', 'account_statement', acc,
    '2026-08-01', '2026-08-31') RETURNING id INTO q5;
  IF EXISTS (SELECT 1 FROM public.bank_statement_periods WHERE source_queue_item_id = q5) THEN RAISE EXCEPTION 'FAIL incomplete draft'; END IF;
  UPDATE public.financial_document_review_queue SET status = 'removed' WHERE id = q4;
  IF EXISTS (SELECT 1 FROM public.bank_statement_periods WHERE source_queue_item_id = q4) THEN RAISE EXCEPTION 'FAIL draft kept after removal'; END IF;

  RAISE NOTICE 'ALL STATEMENT DRAFT TESTS PASSED';
END $T$;
ROLLBACK;
