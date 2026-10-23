-- Stage D checks on disposable rows only. Everything runs inside one DO block that
-- always ends by raising, so every row it creates is rolled back.
-- Expected outcome: ERROR "STAGE_D_OK n checks". Any other error = a failed check.
DO $$
DECLARE
  luis uuid := 'ab5a48c0-939b-4502-bd3b-db7801f0f8b8';
  psa uuid := '00000000-0000-4000-a000-000000000001';
  acct uuid := '90980ef2-4a34-4809-9c39-f63505d7552b';
  ca uuid; cb uuid; d1 uuid; d2 uuid; tx uuid; pay uuid; n int; j jsonb; checks int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', luis, 'email', 'luis@pedrasilva.com', 'role', 'authenticated')::text, true);

  -- Disposable suppliers with the same NIF, two documents, one movement.
  INSERT INTO companies (nome, nif, is_supplier) VALUES ('ZZ Teste Stage D Lda', NULL, true) RETURNING id INTO ca;
  INSERT INTO companies (nome, nif, is_supplier) VALUES ('ZZ TESTE STAGE D, LDA.', NULL, true) RETURNING id INTO cb;
  INSERT INTO financial_documents (doc_type, direction, issue_date, entity_id, counterparty_supplier_id, document_number, total_inc_vat)
    VALUES ('invoice', 'in', '2026-06-10', psa, ca, 'ZZ-STAGE-D-1', 100) RETURNING id INTO d1;
  INSERT INTO financial_documents (doc_type, direction, issue_date, entity_id, counterparty_supplier_id, document_number, total_inc_vat)
    VALUES ('invoice', 'in', '2026-06-11', psa, cb, 'ZZ-STAGE-D-2', 50) RETURNING id INTO d2;
  INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, row_checksum, entity_id)
    VALUES (acct, '2026-10-20', 'ZZ STAGE D TEST', -100, 'zz-stage-d-' || gen_random_uuid(), psa) RETURNING id INTO tx;

  -- 1. Match writes an audit entry linking movement and document.
  INSERT INTO financial_document_payments (document_id, bank_transaction_id, amount, payment_date) VALUES (d1, tx, 100, '2026-10-20') RETURNING id INTO pay;
  SELECT count(*) INTO n FROM fin_reconcile_audit WHERE bank_transaction_id = tx AND document_id = d1 AND action = 'match' AND amount = 100 AND actor_email = 'luis@pedrasilva.com';
  IF n <> 1 THEN RAISE EXCEPTION 'check 1 failed: match audit %', n; END IF; checks := checks + 1;

  -- 2. Amount change is recorded with the old amount.
  UPDATE financial_document_payments SET amount = 90 WHERE id = pay;
  SELECT count(*) INTO n FROM fin_reconcile_audit WHERE payment_id = pay AND action = 'amount_change' AND (detail->>'old_amount')::numeric = 100;
  IF n <> 1 THEN RAISE EXCEPTION 'check 2 failed: amount change %', n; END IF; checks := checks + 1;

  -- 3. Unmatch is recorded.
  DELETE FROM financial_document_payments WHERE id = pay;
  SELECT count(*) INTO n FROM fin_reconcile_audit WHERE payment_id = pay AND action = 'unmatch';
  IF n <> 1 THEN RAISE EXCEPTION 'check 3 failed: unmatch %', n; END IF; checks := checks + 1;

  -- 4. Movement status changes are recorded.
  UPDATE bank_transactions SET status = 'ignored', ignored_reason = 'unspecified' WHERE id = tx;
  SELECT count(*) INTO n FROM fin_reconcile_audit WHERE bank_transaction_id = tx AND action IN ('status_change', 'reconciled', 'unreconciled');
  IF n < 1 THEN RAISE EXCEPTION 'check 4 failed: status audit %', n; END IF; checks := checks + 1;

  -- 5. Register search finds it both ways (by movement text and by document number).
  SELECT count(*) INTO n FROM fin_reconcile_audit_search('ZZ STAGE D', NULL, NULL, NULL, NULL, 50);
  IF n < 3 THEN RAISE EXCEPTION 'check 5 failed: search by movement %', n; END IF;
  SELECT count(*) INTO n FROM fin_reconcile_audit_search(NULL, NULL, NULL, NULL, d1, 50);
  IF n < 3 THEN RAISE EXCEPTION 'check 5b failed: by document %', n; END IF; checks := checks + 1;

  -- 6. Same-name suppliers appear as a candidate pair.
  SELECT count(*) INTO n FROM fin_supplier_duplicate_candidates() c WHERE (c.company_a, c.company_b) IN ((ca, cb), (cb, ca));
  IF n <> 1 THEN RAISE EXCEPTION 'check 6 failed: candidate %', n; END IF; checks := checks + 1;

  -- 7. Merge without a reason is refused.
  BEGIN
    PERFORM fin_merge_companies(ca, cb, '  ');
    RAISE EXCEPTION 'check 7 failed: merged without reason';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'check 7%' THEN RAISE; END IF;
  END; checks := checks + 1;

  -- 8. Merge moves the document, keeps both documents, keeps B inactive, stores alias, logs.
  j := fin_merge_companies(ca, cb, 'teste stage D');
  IF (SELECT counterparty_supplier_id FROM financial_documents WHERE id = d2) <> ca THEN RAISE EXCEPTION 'check 8 failed: doc not moved'; END IF;
  IF (SELECT count(*) FROM financial_documents WHERE id IN (d1, d2)) <> 2 THEN RAISE EXCEPTION 'check 8 failed: document lost'; END IF;
  IF (SELECT is_active FROM companies WHERE id = cb) THEN RAISE EXCEPTION 'check 8 failed: merged still active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM company_aliases WHERE company_id = ca AND source_company_id = cb AND alias = 'ZZ TESTE STAGE D, LDA.') THEN RAISE EXCEPTION 'check 8 failed: alias'; END IF;
  IF NOT EXISTS (SELECT 1 FROM company_merge_log WHERE keep_company_id = ca AND merged_company_id = cb AND merged_by = luis) THEN RAISE EXCEPTION 'check 8 failed: log'; END IF;
  checks := checks + 1;

  -- 9. Merged pair no longer listed; a second merge of B is refused.
  SELECT count(*) INTO n FROM fin_supplier_duplicate_candidates() c WHERE cb IN (c.company_a, c.company_b);
  IF n <> 0 THEN RAISE EXCEPTION 'check 9 failed: still listed'; END IF;
  BEGIN
    PERFORM fin_merge_companies(ca, cb, 'again');
    RAISE EXCEPTION 'check 9 failed: merged twice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'check 9%' THEN RAISE; END IF;
  END; checks := checks + 1;

  -- 10. Non-admin cannot merge.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM fin_merge_companies(cb, ca, 'x');
    RAISE EXCEPTION 'check 10 failed: non-admin merged';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END; checks := checks + 1;

  RAISE EXCEPTION 'STAGE_D_OK % checks', checks;
END $$;
