-- Stage C reconciliation suggestions + stage B card re-test — disposable, fully rolled back.
-- Runs as the admin user under the authenticated role so RLS and company scoping apply.
-- Run through the database query tool. Each company (PSA, Pedra Rioja) gets its own
-- current account, credit card, card statement, supplier documents and movements.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"ab5a48c0-939b-4502-bd3b-db7801f0f8b8","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _res(company text, check_name text, ok boolean, detail text) ON COMMIT DROP;

DO $T$
DECLARE
  ent uuid; nm text; acc uuid; cc uuid; card uuid; cls uuid;
  d_exact uuid; d_fee uuid; d_other uuid; d_big uuid; d_a uuid; d_b uuid; d_past uuid;
  t_main uuid; t_fee uuid; t_part uuid; t_split uuid; t_past uuid; t_bill uuid; t_other uuid;
  qc uuid; p uuid; w jsonb; s record; r uuid; n int; v numeric;
BEGIN
  FOR ent, nm IN SELECT * FROM (VALUES ('00000000-0000-4000-a000-000000000001'::uuid, 'PSA'), ('e0b3ac8e-97a5-4fb1-a2b0-53f65125d114'::uuid, 'Pedra Rioja')) x LOOP
    INSERT INTO public.finance_entity_preferences(user_id, entity_id) VALUES (auth.uid(), ent)
      ON CONFLICT (user_id) DO UPDATE SET entity_id = ent;
    SELECT id INTO cls FROM public.financial_classifications WHERE entity_id = ent AND active AND level::text = 'category' ORDER BY code LIMIT 1;

    INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind)
      VALUES (ent, 'TEST-SUG conta', 'TESTBANK', 'EUR', true, 'bank') RETURNING id INTO acc;
    INSERT INTO public.bank_accounts(entity_id, account_name, bank_name, currency, is_active, account_kind, settles_from_account_id)
      VALUES (ent, 'TEST-SUG cartão', 'TESTBANK', 'EUR', true, 'credit_card', acc) RETURNING id INTO cc;
    INSERT INTO public.payment_cards(entity_id, holder_name, last4, network, card_type, bank_account_id)
      VALUES (ent, 'TEST-SUG', '5511', 'visa', 'credit', cc) RETURNING id INTO card;

    -- Open documents (received).
    INSERT INTO public.financial_documents(entity_id, direction, doc_type, issue_date, document_number, counterparty_name_snapshot, total_inc_vat, classification_id)
    VALUES (ent, 'received', 'supplier_invoice', '2026-07-29', 'ZQX-1001', 'Zebratest Labs Inc', 300, cls) RETURNING id INTO d_exact;
    INSERT INTO public.financial_documents(entity_id, direction, doc_type, issue_date, document_number, counterparty_name_snapshot, total_inc_vat)
    VALUES (ent, 'received', 'supplier_invoice', '2026-09-01', 'OTH-77', 'Outra Empresa Teste', 300) RETURNING id INTO d_other;
    INSERT INTO public.financial_documents(entity_id, direction, doc_type, issue_date, document_number, counterparty_name_snapshot, total_inc_vat)
    VALUES (ent, 'received', 'supplier_invoice', '2026-09-05', 'FEE-55', 'Feecorp Teste', 101.50) RETURNING id INTO d_fee;
    INSERT INTO public.financial_documents(entity_id, direction, doc_type, issue_date, document_number, counterparty_name_snapshot, total_inc_vat)
    VALUES (ent, 'received', 'supplier_invoice', '2026-09-02', 'BIG-9', 'Bigpay Teste', 1000) RETURNING id INTO d_big;
    INSERT INTO public.financial_documents(entity_id, direction, doc_type, issue_date, document_number, counterparty_name_snapshot, total_inc_vat)
    VALUES (ent, 'received', 'supplier_invoice', '2026-09-03', 'SPL-1', 'Splitco Teste', 120) RETURNING id INTO d_a;
    INSERT INTO public.financial_documents(entity_id, direction, doc_type, issue_date, document_number, counterparty_name_snapshot, total_inc_vat)
    VALUES (ent, 'received', 'supplier_invoice', '2026-09-03', 'SPL-2', 'Splitco Teste', 80) RETURNING id INTO d_b;
    -- A past Zebratest bill already paid from a "ZEBRATEST" movement (gives "past matches").
    INSERT INTO public.financial_documents(entity_id, direction, doc_type, issue_date, document_number, counterparty_name_snapshot, total_inc_vat, classification_id)
    VALUES (ent, 'received', 'supplier_invoice', '2026-06-29', 'ZQX-0999', 'Zebratest Labs Inc', 300, cls) RETURNING id INTO d_past;

    INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status) VALUES
      (ent, acc, '2026-07-01', '2026-07-01', 'MDB1234 ZEBRATEST 300.00EUR', -300, 'EUR', 'test-sug-' || gen_random_uuid(), 'unclassified') RETURNING id INTO t_past;
    INSERT INTO public.financial_document_payments(document_id, bank_transaction_id, amount, payment_date, method, created_by)
      VALUES (d_past, t_past, 300, '2026-07-01', 'bank_transfer', auth.uid());

    INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status) VALUES
      (ent, acc, '2026-09-17', '2026-09-17', 'MDB1234 ZEBRATEST 300.00EUR', -300, 'EUR', 'test-sug-' || gen_random_uuid(), 'unclassified') RETURNING id INTO t_main;
    INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status) VALUES
      (ent, acc, '2026-09-08', '2026-09-08', 'TRF FEECORP', -100, 'EUR', 'test-sug-' || gen_random_uuid(), 'unclassified') RETURNING id INTO t_fee;
    INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status) VALUES
      (ent, acc, '2026-09-10', '2026-09-10', 'TRF BIG-9 BIGPAY', -400, 'EUR', 'test-sug-' || gen_random_uuid(), 'unclassified') RETURNING id INTO t_part;
    INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status) VALUES
      (ent, acc, '2026-09-11', '2026-09-11', 'TRF SPLITCO', -200, 'EUR', 'test-sug-' || gen_random_uuid(), 'unclassified') RETURNING id INTO t_split;

    -- 1. Ranking: same amount + past matches + recurring puts Zebratest first, never auto-matched.
    SELECT * INTO s FROM public.fin_reconcile_suggestions(t_main) LIMIT 1;
    INSERT INTO _res VALUES (nm, 'zebratest ranked first', s.ref_id = d_exact, s.label || ' ' || s.confidence || ' ' || s.reasons::text);
    SELECT count(*) INTO n FROM public.fin_reconcile_suggestions(t_main);
    INSERT INTO _res VALUES (nm, 'at most 5 suggestions', n BETWEEN 2 AND 5, n::text);
    SELECT count(*) INTO n FROM public.financial_document_payments WHERE bank_transaction_id = t_main;
    INSERT INTO _res VALUES (nm, 'nothing auto-matched', n = 0, n::text);
    -- Other company's documents never appear.
    SELECT count(*) INTO n FROM public.fin_reconcile_suggestions(t_main) x JOIN public.financial_documents d ON d.id = x.ref_id WHERE d.entity_id <> ent;
    INSERT INTO _res VALUES (nm, 'no other-company documents', n = 0, n::text);

    -- 2. Fee tolerance: 100.00 paid for a 101.50 invoice.
    SELECT * INTO s FROM public.fin_reconcile_suggestions(t_fee) LIMIT 1;
    INSERT INTO _res VALUES (nm, 'fee tolerance', s.ref_id = d_fee AND s.reasons @> '[{"code":"amount_fee"}]', s.reasons::text);

    -- 3. Reference in description + partial payment: 400 of a 1000 invoice; both sides keep an open balance.
    SELECT * INTO s FROM public.fin_reconcile_suggestions(t_part) LIMIT 1;
    INSERT INTO _res VALUES (nm, 'reference + partial', s.ref_id = d_big AND s.reasons @> '[{"code":"reference"}]' AND s.reasons @> '[{"code":"partial_doc"}]' AND s.suggested_amount = 400, s.reasons::text);
    INSERT INTO public.financial_document_payments(document_id, bank_transaction_id, amount, payment_date, method, created_by)
      VALUES (d_big, t_part, 400, '2026-09-10', 'bank_transfer', auth.uid());
    SELECT outstanding_amount INTO v FROM public.financial_documents WHERE id = d_big;
    INSERT INTO _res VALUES (nm, 'document open after partial', v = 600, v::text);
    INSERT INTO _res VALUES (nm, 'movement fully used', public.fin_tx_open_balance(t_part) = 0, public.fin_tx_open_balance(t_part)::text);

    -- 4. Split: one 200 movement pays 120 + 80.
    INSERT INTO public.financial_document_payments(document_id, bank_transaction_id, amount, payment_date, method, created_by)
      VALUES (d_a, t_split, 120, '2026-09-11', 'bank_transfer', auth.uid());
    INSERT INTO _res VALUES (nm, 'split open after first', public.fin_tx_open_balance(t_split) = 80, public.fin_tx_open_balance(t_split)::text);
    SELECT * INTO s FROM public.fin_reconcile_suggestions(t_split) LIMIT 1;
    INSERT INTO _res VALUES (nm, 'split suggests second', s.ref_id = d_b AND s.suggested_amount = 80, s.label);
    INSERT INTO public.financial_document_payments(document_id, bank_transaction_id, amount, payment_date, method, created_by)
      VALUES (d_b, t_split, 80, '2026-09-11', 'bank_transfer', auth.uid());
    SELECT count(*) INTO n FROM public.fin_reconcile_suggestions(t_split);
    INSERT INTO _res VALUES (nm, 'split closed', public.fin_tx_open_balance(t_split) = 0 AND n = 0, n::text);

    -- 5. Learning: confirming Zebratest records "zebratest -> category"; rule is editable.
    INSERT INTO public.financial_document_payments(document_id, bank_transaction_id, amount, payment_date, method, created_by)
      VALUES (d_exact, t_main, 300, '2026-09-17', 'bank_transfer', auth.uid());
    r := public.fin_learn_match_rule(t_main, d_exact);
    SELECT count(*) INTO n FROM public.bank_classification_rules WHERE id = r AND source = 'learned' AND pattern = 'zebratest' AND classification_id IS NOT DISTINCT FROM cls AND entity_id = ent;
    INSERT INTO _res VALUES (nm, 'rule learned', n = 1, coalesce(r::text, 'null'));
    PERFORM public.fin_learn_match_rule(t_main, d_exact);
    SELECT learned_count INTO n FROM public.bank_classification_rules WHERE id = r;
    INSERT INTO _res VALUES (nm, 'rule relearned', n = 2, n::text);
    UPDATE public.bank_classification_rules SET pattern = 'zebratest labs', active = false WHERE id = r;
    SELECT count(*) INTO n FROM public.bank_classification_rules WHERE id = r AND pattern = 'zebratest labs' AND NOT active;
    INSERT INTO _res VALUES (nm, 'rule editable', n = 1, n::text);

    -- 6. Card statement (stage B re-test): bill debit found on the current account it settles from.
    INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status) VALUES
      (ent, acc, '2026-11-05', '2026-11-05', 'PAG CARTAO 5511', -245.60, 'EUR', 'test-sug-' || gen_random_uuid(), 'unclassified') RETURNING id INTO t_bill;
    INSERT INTO public.bank_transactions(entity_id, bank_account_id, transaction_date, value_date, description, amount, currency, row_checksum, status) VALUES
      (ent, cc, '2026-10-02', '2026-10-02', 'COMPRA TESTE', -245.60, 'EUR', 'test-sug-' || gen_random_uuid(), 'unclassified') RETURNING id INTO t_other;
    INSERT INTO public.financial_document_review_queue(entity_id, source_file_url, intake_route, status, doc_type,
      bank_doc_kind, matched_bank_account_id, matched_payment_card_id, extracted_statement_number, extracted_period_start, extracted_period_end,
      extracted_opening_balance, extracted_closing_balance, extracted_card_due_date, extracted_card_amount_to_debit)
    VALUES (ent, 'test-sug/card.pdf', 'bank', 'pending_review', 'bank_statement',
      'card_statement', cc, card, 'C-SUG', '2026-09-21', '2026-10-20', 0, -245.60, '2026-11-05', 245.60) RETURNING id INTO qc;
    p := public.fin_bank_statement_sync_period(qc);
    w := public.fin_period_window(p);
    INSERT INTO _res VALUES (nm, 'card period on card', (SELECT payment_card_id FROM public.bank_statement_periods WHERE id = p) = card, '');
    INSERT INTO _res VALUES (nm, 'card due + amount', (w->'card'->>'due_date') = '2026-11-05' AND (w->'card'->>'amount_to_debit')::numeric = 245.60, (w->'card')::text);
    INSERT INTO _res VALUES (nm, 'settling account is current account', (w->'card'->>'settling_account_id')::uuid = acc, '');
    INSERT INTO _res VALUES (nm, 'bill debit candidate found', (w->'card'->'debit_candidates') @> jsonb_build_array(jsonb_build_object('id', t_bill)) AND jsonb_array_length(w->'card'->'debit_candidates') = 1, (w->'card'->'debit_candidates')::text);
    INSERT INTO _res VALUES (nm, 'card window totals', (w->>'imported_total')::numeric = -245.60 AND (w->>'difference')::numeric = 0, (w->>'imported_total') || ' / ' || (w->>'difference'));
  END LOOP;
  UPDATE public.finance_entity_preferences SET entity_id = '00000000-0000-4000-a000-000000000001' WHERE user_id = auth.uid();
END
$T$;

SELECT company, check_name, ok, detail FROM _res ORDER BY ok, company;
ROLLBACK;
