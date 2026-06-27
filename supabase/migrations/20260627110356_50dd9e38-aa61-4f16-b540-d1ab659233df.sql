-- Supplier cost lines attached directly to architecture stages.
-- Replaces the "supplier parent stage" pattern.

CREATE TABLE public.quote_stage_supplier_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.quote_stages(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL,
  supplier_label text,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  billing_trigger text NOT NULL DEFAULT 'stage_end'
    CHECK (billing_trigger IN ('stage_start','stage_end','split','monthly','custom_date')),
  custom_date date,
  payment_terms text,
  payment_offset_days integer DEFAULT 0,
  vat_rate numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_stage_supplier_costs TO authenticated;
GRANT ALL ON public.quote_stage_supplier_costs TO service_role;

ALTER TABLE public.quote_stage_supplier_costs ENABLE ROW LEVEL SECURITY;

-- Reuse the same access rule as other quote-scoped tables: any authenticated
-- user that can read the parent quote can read/write its supplier cost lines.
CREATE POLICY "qssc_read" ON public.quote_stage_supplier_costs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fee_proposals fp WHERE fp.id = quote_id));

CREATE POLICY "qssc_write" ON public.quote_stage_supplier_costs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fee_proposals fp WHERE fp.id = quote_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fee_proposals fp WHERE fp.id = quote_id));

CREATE INDEX qssc_quote_idx ON public.quote_stage_supplier_costs(quote_id);
CREATE INDEX qssc_stage_idx ON public.quote_stage_supplier_costs(stage_id);

CREATE TRIGGER qssc_updated_at
  BEFORE UPDATE ON public.quote_stage_supplier_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- PM-side mirror.
CREATE TABLE public.pm_stage_supplier_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.pm_stages(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL,
  supplier_label text,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  billing_trigger text NOT NULL DEFAULT 'stage_end'
    CHECK (billing_trigger IN ('stage_start','stage_end','split','monthly','custom_date')),
  custom_date date,
  payment_terms text,
  payment_offset_days integer DEFAULT 0,
  vat_rate numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_stage_supplier_costs TO authenticated;
GRANT ALL ON public.pm_stage_supplier_costs TO service_role;

ALTER TABLE public.pm_stage_supplier_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pmssc_read" ON public.pm_stage_supplier_costs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = project_id));

CREATE POLICY "pmssc_write" ON public.pm_stage_supplier_costs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = project_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = project_id));

CREATE INDEX pmssc_project_idx ON public.pm_stage_supplier_costs(project_id);
CREATE INDEX pmssc_stage_idx ON public.pm_stage_supplier_costs(stage_id);

CREATE TRIGGER pmssc_updated_at
  BEFORE UPDATE ON public.pm_stage_supplier_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- Soft-archive column so we can hide legacy supplier-parent stages
-- without deleting historical rows.
ALTER TABLE public.quote_stages ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.pm_stages    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ---------------------------------------------------------------
-- Group schedule items into a single client invoice.
ALTER TABLE public.quote_payment_schedule_items
  ADD COLUMN IF NOT EXISTS invoice_group_id uuid;
CREATE INDEX IF NOT EXISTS qpsi_invoice_group_idx
  ON public.quote_payment_schedule_items(invoice_group_id);
