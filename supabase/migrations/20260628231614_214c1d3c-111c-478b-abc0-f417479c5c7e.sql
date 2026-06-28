
CREATE TABLE public.pm_payment_schedule_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.pm_stages(id) ON DELETE SET NULL,
  label text NOT NULL,
  trigger_type quote_payment_trigger NOT NULL,
  amount_type quote_payment_amount_type NOT NULL,
  amount_value numeric NOT NULL DEFAULT 0 CHECK (amount_value >= 0),
  expected_invoice_date date,
  expected_payment_date date,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  manual_override boolean NOT NULL DEFAULT false,
  generator_source text,
  direction text NOT NULL DEFAULT 'inflow' CHECK (direction IN ('inflow','outflow')),
  supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  linked_payment_item_id uuid REFERENCES public.pm_payment_schedule_items(id) ON DELETE SET NULL,
  payment_offset_days integer NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 23 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_rate_override boolean NOT NULL DEFAULT false,
  payment_terms text,
  supplier_id uuid REFERENCES public.pm_suppliers(id) ON DELETE SET NULL,
  supplier_label text,
  invoice_group_id uuid,
  billing_status quote_invoice_billing_status NOT NULL DEFAULT 'planned',
  source_quote_payment_item_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_pm_pay_project ON public.pm_payment_schedule_items(project_id, sort_order);
CREATE INDEX idx_pm_pay_stage ON public.pm_payment_schedule_items(stage_id);
CREATE INDEX idx_pm_pay_direction ON public.pm_payment_schedule_items(project_id, direction);
CREATE INDEX idx_pm_pay_invoice_group ON public.pm_payment_schedule_items(invoice_group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_payment_schedule_items TO authenticated;
GRANT ALL ON public.pm_payment_schedule_items TO service_role;

ALTER TABLE public.pm_payment_schedule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized read pm_payment_schedule_items"
  ON public.pm_payment_schedule_items FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_permission(auth.uid(), 'projects.view'::text)
    OR has_permission(auth.uid(), 'finance.dashboard'::text)
  );

CREATE POLICY "Admins insert pm_payment_schedule_items"
  ON public.pm_payment_schedule_items FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update pm_payment_schedule_items"
  ON public.pm_payment_schedule_items FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete pm_payment_schedule_items"
  ON public.pm_payment_schedule_items FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_pm_payment_schedule_items_updated_at
  BEFORE UPDATE ON public.pm_payment_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
