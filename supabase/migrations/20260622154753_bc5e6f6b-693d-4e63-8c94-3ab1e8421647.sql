
-- 1) Cancellable stages
ALTER TABLE public.pm_stages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','cancelled'));

CREATE INDEX IF NOT EXISTS pm_stages_status_idx ON public.pm_stages(status);

-- 2) Contract baseline header
CREATE TABLE public.pm_project_contract_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.fee_proposals(id) ON DELETE SET NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  currency text,
  total_fee numeric(14,2),
  total_internal_fee numeric(14,2),
  total_external_fee numeric(14,2),
  pricing_multiplier numeric(8,4),
  quote_title text,
  quote_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pm_project_contract_baseline TO authenticated;
GRANT ALL ON public.pm_project_contract_baseline TO service_role;
ALTER TABLE public.pm_project_contract_baseline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baseline_read" ON public.pm_project_contract_baseline FOR SELECT TO authenticated USING (true);
CREATE POLICY "baseline_insert" ON public.pm_project_contract_baseline FOR INSERT TO authenticated WITH CHECK (true);

-- 3) Baseline stages
CREATE TABLE public.pm_project_contract_baseline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES public.pm_project_contract_baseline(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_name text,
  start_date date,
  end_date date,
  budget numeric(14,2),
  billing_model text,
  stage_kind text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pm_baseline_stages_baseline_idx ON public.pm_project_contract_baseline_stages(baseline_id);
GRANT SELECT, INSERT ON public.pm_project_contract_baseline_stages TO authenticated;
GRANT ALL ON public.pm_project_contract_baseline_stages TO service_role;
ALTER TABLE public.pm_project_contract_baseline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baseline_stages_read" ON public.pm_project_contract_baseline_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "baseline_stages_insert" ON public.pm_project_contract_baseline_stages FOR INSERT TO authenticated WITH CHECK (true);

-- 4) Baseline payments
CREATE TABLE public.pm_project_contract_baseline_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES public.pm_project_contract_baseline(id) ON DELETE CASCADE,
  label text NOT NULL,
  trigger_type text,
  amount numeric(14,2),
  expected_invoice_date date,
  expected_payment_date date,
  stage_name text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pm_baseline_payments_baseline_idx ON public.pm_project_contract_baseline_payments(baseline_id);
GRANT SELECT, INSERT ON public.pm_project_contract_baseline_payments TO authenticated;
GRANT ALL ON public.pm_project_contract_baseline_payments TO service_role;
ALTER TABLE public.pm_project_contract_baseline_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baseline_payments_read" ON public.pm_project_contract_baseline_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "baseline_payments_insert" ON public.pm_project_contract_baseline_payments FOR INSERT TO authenticated WITH CHECK (true);
