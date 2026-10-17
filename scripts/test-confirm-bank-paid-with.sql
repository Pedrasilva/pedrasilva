-- Exercises the guided empty answer plus the atomic confirmation. No real row is finalized.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ab5a48c0-939b-4502-bd3b-db7801f0f8b8', true);
SELECT set_config('request.jwt.claims', '{"sub":"ab5a48c0-939b-4502-bd3b-db7801f0f8b8","role":"authenticated"}', true);
UPDATE public.companies SET foreign_tax_id = 'TEST-VALID-ISSUER'
WHERE id = '9ea8d22a-f53a-4915-9adb-e79d07e6dea0';
UPDATE public.financial_document_review_queue SET payment_method = NULL, paid_by_holder = NULL,
  paid_from_card_id = NULL, paid_from_account_id = NULL, paid_method_unknown = false, marked_unpaid = false
WHERE id = '9f102d51-8d98-4e5c-838e-f8d081039f65';
SELECT public.fin_queue_set_paid_how('9f102d51-8d98-4e5c-838e-f8d081039f65', '', '');
SELECT public.fin_confirm_queue_item('9f102d51-8d98-4e5c-838e-f8d081039f65',
  '{"link_counterparty_id":"9ea8d22a-f53a-4915-9adb-e79d07e6dea0","paid_from_card_id":null,"paid_from_account_id":null}');
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_document_review_queue q
    JOIN public.financial_documents d ON d.id = q.created_expense_id
    WHERE q.id = '9f102d51-8d98-4e5c-838e-f8d081039f65' AND q.status = 'approved'
      AND q.paid_with_source = 'bank'
      AND q.paid_from_account_id = '90980ef2-4a34-4809-9c39-f63505d7552b'
      AND d.paid_from_account_id = q.paid_from_account_id
  ) THEN RAISE EXCEPTION 'Bank source not carried through confirmation'; END IF;
END $test$;
SELECT 'Empty payment answer filled from bank; document matches' AS result;
ROLLBACK;