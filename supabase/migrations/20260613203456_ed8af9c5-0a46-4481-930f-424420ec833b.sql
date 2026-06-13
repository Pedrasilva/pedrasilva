
ALTER TABLE public.quote_payment_schedule_items
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_label text;

CREATE INDEX IF NOT EXISTS idx_quote_pay_supplier_pm ON public.quote_payment_schedule_items(supplier_id);
