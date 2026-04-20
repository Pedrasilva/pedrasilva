-- ========== 1. EXTEND pm_invoices ==========
ALTER TABLE public.pm_invoices
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS bill_to_name text,
  ADD COLUMN IF NOT EXISTS bill_to_address text,
  ADD COLUMN IF NOT EXISTS bill_to_email text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 23;

-- ========== 2. EXTEND pm_invoice_settings ==========
ALTER TABLE public.pm_invoice_settings
  ADD COLUMN IF NOT EXISTS file_name text DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS wd_group_by text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS wd_include_non_billable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wd_date boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wd_hours boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wd_rate boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wd_amount boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wd_owner boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wd_subject boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wd_description boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.pm_projects(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS pm_invoice_settings_project_uniq ON public.pm_invoice_settings(project_id) WHERE project_id IS NOT NULL;

-- ========== 3. MATERIALS ==========
CREATE TABLE IF NOT EXISTS public.pm_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  purchase_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pm_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_materials" ON public.pm_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_materials" ON public.pm_materials FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_materials" ON public.pm_materials FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete pm_materials" ON public.pm_materials FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pm_materials_updated_at BEFORE UPDATE ON public.pm_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 4. EXPENSES (project) ==========
CREATE TABLE IF NOT EXISTS public.pm_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  purchase_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  expense_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pm_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_expenses" ON public.pm_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_expenses" ON public.pm_expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_expenses" ON public.pm_expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete pm_expenses" ON public.pm_expenses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pm_expenses_updated_at BEFORE UPDATE ON public.pm_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 5. ACTIVITIES (Stream feed) ==========
CREATE TABLE IF NOT EXISTS public.pm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.pm_stages(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.pm_tasks(id) ON DELETE SET NULL,
  author_resource_id uuid REFERENCES public.pm_resources(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text,
  logged_hours numeric NOT NULL DEFAULT 0,
  logged_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_activities" ON public.pm_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert pm_activities" ON public.pm_activities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pm_activities" ON public.pm_activities FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins delete pm_activities" ON public.pm_activities FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pm_activities_updated_at BEFORE UPDATE ON public.pm_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 6. ACTIVITY REPLIES ==========
CREATE TABLE IF NOT EXISTS public.pm_activity_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.pm_activities(id) ON DELETE CASCADE,
  author_resource_id uuid REFERENCES public.pm_resources(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pm_activity_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_activity_replies" ON public.pm_activity_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert pm_activity_replies" ON public.pm_activity_replies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pm_activity_replies" ON public.pm_activity_replies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins delete pm_activity_replies" ON public.pm_activity_replies FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ========== 7. PROJECT RATE OVERRIDES ==========
CREATE TABLE IF NOT EXISTS public.pm_project_rate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.pm_resources(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  project_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, resource_id)
);

ALTER TABLE public.pm_project_rate_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_project_rate_overrides" ON public.pm_project_rate_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_project_rate_overrides" ON public.pm_project_rate_overrides FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_project_rate_overrides" ON public.pm_project_rate_overrides FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete pm_project_rate_overrides" ON public.pm_project_rate_overrides FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pm_project_rate_overrides_updated_at BEFORE UPDATE ON public.pm_project_rate_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 8. RESOURCE RATES (notas column) ==========
ALTER TABLE public.pm_resource_rates
  ADD COLUMN IF NOT EXISTS notes text;

-- ========== 9. UNIQUE constraint for pm_resource_rates upsert ==========
ALTER TABLE public.pm_resource_rates
  DROP CONSTRAINT IF EXISTS pm_resource_rates_resource_effective_uniq;
ALTER TABLE public.pm_resource_rates
  ADD CONSTRAINT pm_resource_rates_resource_effective_uniq UNIQUE (resource_id, effective_from);