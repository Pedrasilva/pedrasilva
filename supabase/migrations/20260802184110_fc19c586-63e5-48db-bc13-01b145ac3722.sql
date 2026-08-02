ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS opening_balance_receivable numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_payable numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.companies.opening_balance_receivable IS 'Carried-over amount this client owed us before hub go-live (statement opening balance).';
COMMENT ON COLUMN public.companies.opening_balance_payable IS 'Carried-over amount we owed this supplier before hub go-live (statement opening balance).';