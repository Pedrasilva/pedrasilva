-- Align existing bank_transactions.row_checksum with the new canonical algorithm
-- (content key + occurrence ordinal, instead of the source spreadsheet row index),
-- so Excel uploads and MT940 email imports dedupe against each other.
ALTER TABLE public.bank_transactions DISABLE TRIGGER trg_bt_guard_immutable;

WITH keyed AS (
  SELECT
    id,
    bank_account_id,
    transaction_date::text
      || '|' || coalesce(value_date::text, '')
      || '|' || to_char(amount, 'FM9999999999990.00')
      || '|' || btrim(regexp_replace(description, '\s+', ' ', 'g'))
      || '|' || coalesce(to_char(running_balance, 'FM9999999999990.00'), '') AS content_key
  FROM public.bank_transactions
), numbered AS (
  SELECT
    id,
    content_key,
    row_number() OVER (
      PARTITION BY bank_account_id, content_key
      ORDER BY id
    ) AS occurrence
  FROM keyed
)
UPDATE public.bank_transactions bt
SET row_checksum = encode(
  extensions.digest(n.content_key || '|#' || n.occurrence, 'sha256'),
  'hex'
)
FROM numbered n
WHERE n.id = bt.id;

ALTER TABLE public.bank_transactions ENABLE TRIGGER trg_bt_guard_immutable;