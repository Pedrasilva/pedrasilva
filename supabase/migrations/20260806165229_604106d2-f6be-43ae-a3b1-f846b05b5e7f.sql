-- Internal transfers are real movements that were reviewed and resolved:
-- count them in the calculated balance.
UPDATE public.bank_transactions
   SET reconciled_at = COALESCE(reconciled_at, COALESCE(classified_at, now())),
       reconciled_by = COALESCE(reconciled_by, classified_by)
 WHERE status = 'internal_transfer'
   AND reconciled_at IS NULL;

-- Existing "ignored" rows carry no reason, so we cannot tell duplicates from
-- real movements (bank fees etc.). Label them for review; they stay excluded
-- from the calculated balance until a reason is set.
UPDATE public.bank_transactions
   SET ignored_reason = 'unspecified'
 WHERE status = 'ignored'
   AND ignored_reason IS NULL;

COMMENT ON COLUMN public.bank_transactions.ignored_reason IS
  'duplicate = duplicate import line, excluded from the calculated balance; resolved = real movement needing no document, counts toward the balance; unspecified = legacy, needs review.';