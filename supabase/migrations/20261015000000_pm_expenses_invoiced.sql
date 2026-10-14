ALTER TABLE public.pm_expenses
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_reference text,
  ADD COLUMN IF NOT EXISTS invoiced_in_invoice_id uuid REFERENCES public.pm_invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pm_expenses_ready_to_invoice
  ON public.pm_expenses (project_id)
  WHERE status = 'approved' AND rebillable = true AND invoiced_at IS NULL;