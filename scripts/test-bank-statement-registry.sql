-- Stage A bank document registry — disposable, fully rolled back.
-- Runs as the admin user under the authenticated role so RLS and entity scoping apply.
-- Run through the database query tool (the sandbox psql role cannot read the auth schema).
-- Covers: current-account + card statements in PSA and Pedra Rioja, AI value kept on
-- correction, period created/updated from corrected values, continuity, duplicate
-- period refused, locked period refuses edits, registry figures.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"ab5a48c0-939b-4502-bd3b-db7801f0f8b8","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $T$
DECLARE
  psa uuid := '00000000-0000-4000-a000-000000000001';
  pr  uuid := 'e0b3ac8e-97a5-4fb1-a2b0-53f65125d114';
  acc_psa uuid; acc_psa_cc uuid; card_psa uuid;
  acc_pr uuid;  acc_pr_cc uuid;  card_pr uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; q6 uuid;
  p1 uuid; p uuid; v record; ok boolean;
BEGIN
  INSERT INTO public.finance_entity_preferences(user_id, entity_id) VALUES (auth.uid(), psa)
    ON CONFLICT (user_id) DO UPDATE SET entity_id = psa;

  -- ---------- PSA ----------
  INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind, iban)
    VALUES (psa, 'TEST-REG PSA conta', 'TESTBANK', 'EUR', true, 'bank', 'PT50999900000000000000001') RETURNING id INTO acc_psa;
  INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind, settles_from_account_id)
    VALUES (psa, 'TEST-REG PSA cartão', 'TESTBANK', 'EUR', true, 'credit_card', acc_psa) RETURNING id INTO acc_psa_cc;
  INSERT INTO public.payment_cards(entity_id, holder_name, last4, network, card_type, bank_account_id)
    VALUES (psa, 'TEST-REG', '4321', 'visa', 'credit', acc_psa_cc) RETURNING id INTO card_psa;

  -- Movements in October: -249.50 total.
  INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status)
  VALUES (psa, acc_psa, '2026-10-05', '2026-10-05', 'TEST-REG a', -300.00, 'EUR', 'test-reg-' || gen_random_uuid(), 'unclassified'),
         (psa, acc_psa, '2026-10-20', '2026-10-20', 'TEST-REG b',   50.50, 'EUR', 'test-reg-' || gen_random_uuid(), 'unclassified');

  -- Current-account statement October; AI misread the closing balance (800 instead of 750.50).
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_statement_number, extracted_period_start, extracted_period_end,
    extracted_opening_balance, extracted_closing_balance, bank_ai_values)
  VALUES (psa, 'test-reg/psa-oct.pdf', 'bank', 'pending_review', 'bank_statement',
    'account_statement', acc_psa, '010/2026', '2026-10-01', '2026-10-31', 1000, 800,
    '{"extracted_closing_balance":800,"extracted_opening_balance":1000}') RETURNING id INTO q1;

  SELECT * INTO v FROM public.fin_bank_document_registry(q1);
  IF v.hub_total <> -249.50 OR v.hub_count <> 2 THEN RAISE EXCEPTION 'FAIL registry figures %', v; END IF;

  -- Correct closing → override recorded, AI value kept.
  PERFORM public.fin_bank_statement_save(q1, '{"extracted_closing_balance": 750.50}');
  SELECT * INTO v FROM public.financial_document_review_queue WHERE id = q1;
  IF v.extracted_closing_balance <> 750.50 THEN RAISE EXCEPTION 'FAIL corrected value not applied'; END IF;
  IF (v.bank_ai_values->>'extracted_closing_balance')::numeric <> 800 THEN RAISE EXCEPTION 'FAIL AI value lost'; END IF;
  IF (v.bank_field_overrides->'extracted_closing_balance'->>'by')::uuid IS DISTINCT FROM auth.uid()
     OR v.bank_field_overrides->'extracted_closing_balance'->>'at' IS NULL THEN RAISE EXCEPTION 'FAIL override who/when'; END IF;

  -- Confirm → period from corrected values, linked to the document.
  p1 := public.fin_bank_statement_sync_period(q1);
  SELECT * INTO v FROM public.bank_statement_periods WHERE id = p1;
  IF v.closing_balance <> 750.50 OR v.opening_balance <> 1000 OR v.source_queue_item_id <> q1 OR v.statement_number <> '010/2026'
    THEN RAISE EXCEPTION 'FAIL period values %', v; END IF;
  -- Hub check (existing status function counts reconciled only) still works on this period.
  PERFORM 1 FROM public.bank_statement_period_status(acc_psa) WHERE period_id = p1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL period status'; END IF;

  -- Correcting after confirmation updates the period too.
  PERFORM public.fin_bank_statement_save(q1, '{"extracted_opening_balance": 1000.00, "extracted_statement_number": "010/2026"}');
  PERFORM public.fin_bank_statement_save(q1, '{"extracted_closing_balance": 750.49}');
  IF (SELECT closing_balance FROM public.bank_statement_periods WHERE id = p1) <> 750.49 THEN RAISE EXCEPTION 'FAIL period not updated'; END IF;
  PERFORM public.fin_bank_statement_save(q1, '{"extracted_closing_balance": 800}');
  IF (SELECT bank_field_overrides ? 'extracted_closing_balance' FROM public.financial_document_review_queue WHERE id = q1)
    THEN RAISE EXCEPTION 'FAIL back-to-AI value should clear the correction mark'; END IF;
  PERFORM public.fin_bank_statement_save(q1, '{"extracted_closing_balance": 750.50}');

  -- Duplicate: a second statement for the same account + period is refused.
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_period_start, extracted_period_end, extracted_opening_balance, extracted_closing_balance)
  VALUES (psa, 'test-reg/psa-oct-copy.pdf', 'bank', 'pending_review', 'bank_statement',
    'account_statement', acc_psa, '2026-10-01', '2026-10-31', 1000, 750.50) RETURNING id INTO q2;
  ok := false;
  BEGIN PERFORM public.fin_bank_statement_sync_period(q2); EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL duplicate period not refused'; END IF;

  -- November statement whose opening differs from October's closing (continuity data for the UI).
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_statement_number, extracted_period_start, extracted_period_end,
    extracted_opening_balance, extracted_closing_balance)
  VALUES (psa, 'test-reg/psa-nov.pdf', 'bank', 'pending_review', 'bank_statement',
    'account_statement', acc_psa, '011/2026', '2026-11-01', '2026-11-30', 760.50, 760.50) RETURNING id INTO q3;
  PERFORM public.fin_bank_statement_sync_period(q3);

  -- Card statement PSA (card period lives on the card's own account).
  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, matched_payment_card_id, extracted_statement_number, extracted_period_start, extracted_period_end,
    extracted_opening_balance, extracted_closing_balance, extracted_card_due_date, extracted_card_amount_to_debit)
  VALUES (psa, 'test-reg/psa-card.pdf', 'bank', 'pending_review', 'bank_statement',
    'card_statement', acc_psa_cc, card_psa, 'C-10', '2026-09-21', '2026-10-20', -120, -300, '2026-11-05', 300) RETURNING id INTO q4;
  p := public.fin_bank_statement_sync_period(q4);
  IF (SELECT payment_card_id FROM public.bank_statement_periods WHERE id = p) <> card_psa THEN RAISE EXCEPTION 'FAIL card period'; END IF;
  -- A card statement pointed at a current account is refused.
  PERFORM public.fin_bank_statement_save(q4, jsonb_build_object('matched_bank_account_id', acc_psa));
  RAISE EXCEPTION 'FAIL card on current account accepted';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'card_account_required' THEN RAISE; END IF;
  RAISE NOTICE 'PSA part OK (card on current account refused)';
END
$T$;

-- The DO block above aborts at its last statement by design; redo the remaining checks
-- in a second block (the first block's work was rolled back with it).
DO $T$
DECLARE
  psa uuid := '00000000-0000-4000-a000-000000000001';
  pr  uuid := 'e0b3ac8e-97a5-4fb1-a2b0-53f65125d114';
  acc uuid; acc_cc uuid; card uuid; q uuid; qc uuid; p uuid; ok boolean;
BEGIN
  -- ---------- Pedra Rioja ----------
  INSERT INTO public.finance_entity_preferences(user_id, entity_id) VALUES (auth.uid(), pr)
    ON CONFLICT (user_id) DO UPDATE SET entity_id = pr;
  INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind)
    VALUES (pr, 'TEST-REG PR conta', 'TESTBANK', 'EUR', true, 'bank') RETURNING id INTO acc;
  INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind, settles_from_account_id)
    VALUES (pr, 'TEST-REG PR cartão', 'TESTBANK', 'EUR', true, 'credit_card', acc) RETURNING id INTO acc_cc;
  INSERT INTO public.payment_cards(entity_id, holder_name, last4, network, card_type, bank_account_id)
    VALUES (pr, 'TEST-REG', '8765', 'mastercard', 'credit', acc_cc) RETURNING id INTO card;

  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, extracted_statement_number, extracted_period_start, extracted_period_end,
    extracted_opening_balance, extracted_closing_balance)
  VALUES (pr, 'test-reg/pr-oct.pdf', 'bank', 'pending_review', 'bank_statement',
    'account_statement', acc, '7/2026', '2026-10-01', '2026-10-31', 5000, 5000) RETURNING id INTO q;
  p := public.fin_bank_statement_sync_period(q);
  IF (SELECT entity_id FROM public.bank_statement_periods WHERE id = p) <> pr THEN RAISE EXCEPTION 'FAIL PR period entity'; END IF;

  INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
    bank_doc_kind, matched_bank_account_id, matched_payment_card_id, extracted_period_start, extracted_period_end,
    extracted_opening_balance, extracted_closing_balance, extracted_card_amount_to_debit)
  VALUES (pr, 'test-reg/pr-card.pdf', 'bank', 'pending_review', 'bank_statement',
    'card_statement', acc_cc, card, '2026-09-21', '2026-10-20', 0, -45.10, 45.10) RETURNING id INTO qc;
  PERFORM public.fin_bank_statement_sync_period(qc);
  IF (SELECT statement_number FROM public.bank_statement_periods WHERE source_queue_item_id = qc) <> '2026-10'
    THEN RAISE EXCEPTION 'FAIL missing number fallback'; END IF;

  -- PSA cannot see Pedra Rioja's statement once switched back.
  UPDATE public.finance_entity_preferences SET entity_id = psa WHERE user_id = auth.uid();
  IF current_setting('is_superuser') = 'off' AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)
     AND EXISTS (SELECT 1 FROM public.fin_bank_document_registry(q)) THEN RAISE EXCEPTION 'FAIL PR row visible from PSA'; END IF;
  UPDATE public.finance_entity_preferences SET entity_id = pr WHERE user_id = auth.uid();

  -- Locked period refuses edits (lock set directly; reopening with a reason comes in stage B).
  UPDATE public.bank_statement_periods SET locked_at = now(), locked_by = auth.uid() WHERE id = p;
  ok := false;
  BEGIN PERFORM public.fin_bank_statement_save(q, '{"extracted_closing_balance": 1}');
  EXCEPTION WHEN check_violation THEN ok := SQLERRM = 'period_locked'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL locked period edit allowed'; END IF;

  -- Non-editable field rejected.
  ok := false;
  BEGIN PERFORM public.fin_bank_statement_save(qc, '{"status": "filed"}');
  EXCEPTION WHEN invalid_parameter_value THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL non-editable field accepted'; END IF;

  RAISE NOTICE 'ALL BANK REGISTRY TESTS PASSED';
END
$T$;

SELECT 'ALL BANK REGISTRY TESTS PASSED' AS result;
ROLLBACK;
