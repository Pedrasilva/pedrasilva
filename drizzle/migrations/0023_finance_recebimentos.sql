ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS payment_direction text CHECK (payment_direction IN ('incoming','outgoing')),
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS payer_vat text,
  ADD COLUMN IF NOT EXISTS payer_iban text,
  ADD COLUMN IF NOT EXISTS beneficiary_name text,
  ADD COLUMN IF NOT EXISTS beneficiary_vat text,
  ADD COLUMN IF NOT EXISTS beneficiary_iban text,
  ADD COLUMN IF NOT EXISTS payment_description text,
  ADD COLUMN IF NOT EXISTS recebimento_id uuid;

CREATE TABLE public.finance_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  client_match_method text CHECK (client_match_method IN ('nif','iban','name','manual')),
  client_match_detail text,
  payer_name text,
  payer_vat text,
  payer_iban text,
  amount numeric(14,2) NOT NULL,
  received_date date NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','confirmed')),
  suggested_bank_transaction_ids uuid[] NOT NULL DEFAULT '{}',
  suggested_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  bank_transaction_ids uuid[] NOT NULL DEFAULT '{}',
  pm_invoice_ids uuid[] NOT NULL DEFAULT '{}',
  schedule_item_ids uuid[] NOT NULL DEFAULT '{}',
  financial_document_ids uuid[] NOT NULL DEFAULT '{}',
  project_ids uuid[] NOT NULL DEFAULT '{}',
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_recebimentos_company_idx ON public.finance_recebimentos(company_id);
CREATE INDEX finance_recebimentos_date_idx ON public.finance_recebimentos(received_date);
CREATE INDEX finance_recebimentos_projects_idx ON public.finance_recebimentos USING gin(project_ids);

ALTER TABLE public.financial_document_review_queue
  ADD CONSTRAINT fdrq_recebimento_fk FOREIGN KEY (recebimento_id) REFERENCES public.finance_recebimentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fdrq_recebimento_idx ON public.financial_document_review_queue(recebimento_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_recebimentos TO authenticated;
GRANT ALL ON public.finance_recebimentos TO service_role;
ALTER TABLE public.finance_recebimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance and project-financial readers read recebimentos" ON public.finance_recebimentos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'finance.dashboard')
    OR public.has_module_permission(auth.uid(), 'projects.view_financials', 'all'));
CREATE POLICY "Finance users manage recebimentos" ON public.finance_recebimentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));

CREATE TABLE public.company_ibans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  iban text NOT NULL UNIQUE,
  recebimento_id uuid REFERENCES public.finance_recebimentos(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_ibans_company_idx ON public.company_ibans(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_ibans TO authenticated;
GRANT ALL ON public.company_ibans TO service_role;
ALTER TABLE public.company_ibans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage company ibans" ON public.company_ibans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_permission(auth.uid(), 'finance.dashboard'));