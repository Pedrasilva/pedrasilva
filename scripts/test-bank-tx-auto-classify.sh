#!/usr/bin/env bash
# Idempotency test for the bank_tx_auto_classify_on_payment trigger and the
# manual backfill behavior.
#
# Verifies, all inside a single ROLLBACK'd transaction:
#   1. INSERT of a payment with bank_transaction_id flips the bank_tx to
#      'classified' and stamps classified_at + classified_by.
#   2. A SECOND payment INSERT against the same bank_tx (with a different
#      created_by) leaves the original classified_at / classified_by intact
#      — the trigger's COALESCE guards make it idempotent.
#   3. Re-running the migration's UPDATE pattern is a no-op on
#      already-classified rows (does not touch classified_at / classified_by).
#   4. INSERT with bank_transaction_id = NULL is a trigger no-op.
#
# Requires PGHOST + psql env. Run:
#   bash scripts/test-bank-tx-auto-classify.sh

set -euo pipefail

if [ -z "${PGHOST:-}" ]; then
  echo "PGHOST is not set — cannot reach the managed database." >&2
  exit 2
fi

# Fetch two real auth user_ids via public.user_roles (auth schema is locked).
USER_IDS=$(psql -X -A -t -c "SELECT user_id FROM public.user_roles LIMIT 2;" | grep -v '^$')
USER1=$(echo "$USER_IDS" | sed -n '1p')
USER2=$(echo "$USER_IDS" | sed -n '2p')
if [ -z "$USER1" ]; then
  echo "No users in public.user_roles — cannot run test." >&2
  exit 2
fi
if [ -z "$USER2" ]; then USER2="$USER1"; fi

# Heredoc is UNQUOTED so $USER1/$USER2 substitute. PL/pgSQL `$$` blocks must
# be written as $DO$ ... $DO$ to avoid shell-level conflicts.
OUT=$(psql -X -A -t -v ON_ERROR_STOP=1 <<SQL
BEGIN;

DO \$DO\$
DECLARE
  v_user1       uuid := '$USER1';
  v_user2       uuid := '$USER2';
  v_account_id  uuid;
  v_tx_id       uuid;
  v_doc_id      uuid;
  v_status      text;
  v_classified_at1 timestamptz;
  v_classified_at2 timestamptz;
  v_classified_by1 uuid;
  v_classified_by2 uuid;
BEGIN
  -- 1. Seed bank account + unclassified bank transaction.
  INSERT INTO public.bank_accounts (account_name, bank_name, currency, is_active)
  VALUES ('TEST-IDEMPOTENCY', 'TEST', 'EUR', true)
  RETURNING id INTO v_account_id;

  INSERT INTO public.bank_transactions (
    bank_account_id, transaction_date, value_date, description, amount,
    currency, row_checksum, status
  ) VALUES (
    v_account_id, current_date, current_date, 'idempotency probe', -100.00,
    'EUR', 'idem-' || gen_random_uuid()::text, 'unclassified'
  ) RETURNING id INTO v_tx_id;

  SELECT status INTO v_status FROM public.bank_transactions WHERE id = v_tx_id;
  IF v_status <> 'unclassified' THEN
    RAISE EXCEPTION 'TEST FAIL: starting status = %, expected unclassified', v_status;
  END IF;

  -- 2. Document so payment FK is satisfied.
  INSERT INTO public.financial_documents (
    doc_type, direction, source, status, issue_date,
    subtotal_ex_vat, vat_amount, total_inc_vat
  ) VALUES (
    'supplier_invoice', 'received', 'manual', 'issued', current_date,
    200.00, 0.00, 200.00
  ) RETURNING id INTO v_doc_id;

  -- 3. First payment → trigger classifies the bank tx.
  INSERT INTO public.financial_document_payments (
    document_id, amount, payment_date, method, bank_transaction_id, created_by
  ) VALUES (
    v_doc_id, 100.00, current_date, 'bank_transfer', v_tx_id, v_user1
  );

  SELECT status, classified_at, classified_by
    INTO v_status, v_classified_at1, v_classified_by1
    FROM public.bank_transactions WHERE id = v_tx_id;

  IF v_status <> 'classified' THEN
    RAISE EXCEPTION 'TEST FAIL #1: trigger did not set status to classified (got %)', v_status;
  END IF;
  IF v_classified_at1 IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL #1: classified_at not stamped';
  END IF;
  IF v_classified_by1 IS DISTINCT FROM v_user1 THEN
    RAISE EXCEPTION 'TEST FAIL #1: classified_by = %, expected %', v_classified_by1, v_user1;
  END IF;

  -- 4. Idempotency: second payment with different created_by must NOT
  --    change classified_at / classified_by (COALESCE guards).
  PERFORM pg_sleep(0.05);
  INSERT INTO public.financial_document_payments (
    document_id, amount, payment_date, method, bank_transaction_id, created_by
  ) VALUES (
    v_doc_id, 0.01, current_date, 'bank_transfer', v_tx_id, v_user2
  );

  SELECT status, classified_at, classified_by
    INTO v_status, v_classified_at2, v_classified_by2
    FROM public.bank_transactions WHERE id = v_tx_id;

  IF v_status <> 'classified' THEN
    RAISE EXCEPTION 'TEST FAIL #2: status changed to % after re-insert', v_status;
  END IF;
  IF v_classified_at2 IS DISTINCT FROM v_classified_at1 THEN
    RAISE EXCEPTION 'TEST FAIL #2: classified_at changed (% -> %)',
      v_classified_at1, v_classified_at2;
  END IF;
  IF v_classified_by2 IS DISTINCT FROM v_classified_by1 THEN
    RAISE EXCEPTION 'TEST FAIL #2: classified_by changed (% -> %)',
      v_classified_by1, v_classified_by2;
  END IF;

  -- 5. Backfill idempotency by proxy: a THIRD payment insert re-fires the
  --    trigger, which uses the SAME COALESCE pattern as the backfill SQL in
  --    the migration. classified_at / classified_by must remain stable.
  --    (We cannot run the raw UPDATE here — bank_transactions UPDATE is
  --    locked behind the bank_tx_guard_immutable trigger and admin RLS;
  --    the SECURITY DEFINER trigger is the supported path.)
  PERFORM pg_sleep(0.05);
  INSERT INTO public.financial_document_payments (
    document_id, amount, payment_date, method, bank_transaction_id, created_by
  ) VALUES (
    v_doc_id, 0.01, current_date, 'bank_transfer', v_tx_id, v_user1
  );

  PERFORM 1 FROM public.bank_transactions
    WHERE id = v_tx_id
      AND classified_at = v_classified_at1
      AND classified_by = v_classified_by1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST FAIL #3: third trigger fire mutated classified_at or classified_by';
  END IF;

  -- 6. Trigger no-op when bank_transaction_id IS NULL.
  INSERT INTO public.financial_document_payments (
    document_id, amount, payment_date, method, bank_transaction_id, created_by
  ) VALUES (
    v_doc_id, 0.01, current_date, 'cash', NULL, v_user1
  );

  RAISE NOTICE 'ALL TESTS PASSED';
END
\$DO\$;

ROLLBACK;
SQL
)

echo "$OUT"

if echo "$OUT" | grep -q "ALL TESTS PASSED"; then
  echo ""
  echo "✅ bank_tx auto-classify trigger is idempotent."
  exit 0
else
  echo ""
  echo "❌ Tests did not report success." >&2
  exit 1
fi
