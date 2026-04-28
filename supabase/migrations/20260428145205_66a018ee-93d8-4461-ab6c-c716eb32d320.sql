CREATE TABLE public.financial_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type text NOT NULL DEFAULT 'excel_seed',
  file_name text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  rows_expenses integer NOT NULL DEFAULT 0,
  rows_income integer NOT NULL DEFAULT 0,
  rows_suppliers integer NOT NULL DEFAULT 0,
  rows_clients integer NOT NULL DEFAULT 0,
  rows_debts integer NOT NULL DEFAULT 0,
  rows_bank_accounts integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view import logs"
  ON public.financial_import_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert import logs"
  ON public.financial_import_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update import logs"
  ON public.financial_import_logs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete import logs"
  ON public.financial_import_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_financial_import_logs_updated_at
  BEFORE UPDATE ON public.financial_import_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_financial_import_logs_imported_at
  ON public.financial_import_logs (imported_at DESC);