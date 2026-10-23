-- Statement IDs: '<code> <MM>/<YYYY>[-n]', card '<NETWORK> <last4> <MM>/<YYYY>'.
UPDATE public.bank_accounts SET statement_code = 'MBCPASSOC' WHERE id = '6dc3eb08-9028-4587-9f0c-d9e44da3c429';
UPDATE public.bank_accounts SET statement_code = 'PR MBCP' WHERE id = '09a1e9ae-957a-4aa7-b7b9-0a9d8b780457';
UPDATE public.bank_accounts SET statement_code = 'PR CGD' WHERE id = 'eb03ff40-2d0d-4202-93ff-1ddc6c1278d9';

CREATE OR REPLACE FUNCTION public.fin_statement_base_code(_account_id uuid, _card_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _card_id IS NOT NULL THEN (
      SELECT CASE lower(c.network) WHEN 'visa' THEN 'VISA' WHEN 'mastercard' THEN 'MC' WHEN 'amex' THEN 'AMEX' ELSE 'CARD' END
             || COALESCE(' ' || NULLIF(c.last4, ''), '')
        FROM public.payment_cards c WHERE c.id = _card_id)
    ELSE (SELECT COALESCE(NULLIF(a.statement_code, ''),
                 upper(regexp_replace(a.account_name, '^\s*\d+\s*', '')))
            FROM public.bank_accounts a WHERE a.id = _account_id)
  END
$$;

CREATE OR REPLACE FUNCTION public.fin_statement_period_code(_account_id uuid, _card_id uuid, _end date, _self uuid)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  base text := public.fin_statement_base_code(_account_id, _card_id) || ' ' || to_char(_end, 'MM/YYYY');
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

-- Rename existing periods (ID only; balances, movements and matches untouched).
UPDATE public.bank_statement_periods p
   SET statement_number = public.fin_statement_base_code(p.bank_account_id, p.payment_card_id) || ' '
       || to_char(p.period_end_date, 'MM/YYYY') || COALESCE(substring(p.statement_number from '(-\d+)$'), '')
 WHERE p.statement_number ~ '\d{2}/\d{4}(-\d+)?$';

COMMENT ON COLUMN public.bank_statement_periods.statement_number IS 'Hub statement ID: account/card code, space, MM/YYYY (+ -n when a bank issues several in a month).';