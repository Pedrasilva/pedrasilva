DO $$ BEGIN
  CREATE TYPE public.quote_invoice_billing_status AS ENUM ('planned','issued','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.quote_payment_schedule_items
  ADD COLUMN IF NOT EXISTS billing_status public.quote_invoice_billing_status NOT NULL DEFAULT 'planned';