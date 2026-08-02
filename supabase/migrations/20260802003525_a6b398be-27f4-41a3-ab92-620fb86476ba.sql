CREATE TYPE public.bank_account_kind AS ENUM ('bank', 'credit_card', 'benefits', 'other');

ALTER TABLE public.bank_accounts
  ADD COLUMN account_kind public.bank_account_kind NOT NULL DEFAULT 'bank',
  ADD COLUMN archived_at timestamptz;

UPDATE public.bank_accounts SET account_kind = 'credit_card' WHERE account_name ILIKE 'CC %';
UPDATE public.bank_accounts SET account_kind = 'benefits' WHERE account_name ILIKE '%COVERFLEX%' OR bank_name ILIKE '%coverflex%';

CREATE INDEX IF NOT EXISTS idx_bank_accounts_archived_at ON public.bank_accounts (archived_at);