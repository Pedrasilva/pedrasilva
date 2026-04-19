-- ============================================
-- FASE 3 - PASSO 1: Tabelas em falta para Stagecraft completo
-- ============================================

-- 1. Adicionar colunas em falta a pm_resources
ALTER TABLE public.pm_resources
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cost_rate NUMERIC(8,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS sale_rate NUMERIC(8,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS rate_effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Migrar hourly_rate para sale_rate quando sale_rate for default
UPDATE public.pm_resources
  SET sale_rate = hourly_rate
  WHERE sale_rate = 100 AND hourly_rate <> 100;

-- 2. Tabela pm_resource_rates (histórico de rates)
CREATE TABLE IF NOT EXISTS public.pm_resource_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.pm_resources(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  cost_rate NUMERIC(8,2) NOT NULL DEFAULT 50,
  sale_rate NUMERIC(8,2) NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(resource_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_pm_resource_rates_resource ON public.pm_resource_rates(resource_id, effective_from DESC);

ALTER TABLE public.pm_resource_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_resource_rates" ON public.pm_resource_rates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_resource_rates" ON public.pm_resource_rates
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_resource_rates" ON public.pm_resource_rates
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete pm_resource_rates" ON public.pm_resource_rates
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pm_resource_rates_updated_at
  BEFORE UPDATE ON public.pm_resource_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Settings de faturação (singleton)
CREATE TABLE IF NOT EXISTS public.pm_invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  company_name TEXT NOT NULL DEFAULT '',
  company_address TEXT,
  company_email TEXT,
  company_phone TEXT,
  company_nif TEXT,
  iban TEXT,
  bank_name TEXT,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 23,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  default_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pm_invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read pm_invoice_settings" ON public.pm_invoice_settings
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert pm_invoice_settings" ON public.pm_invoice_settings
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_invoice_settings" ON public.pm_invoice_settings
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pm_invoice_settings_updated_at
  BEFORE UPDATE ON public.pm_invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir singleton inicial
INSERT INTO public.pm_invoice_settings (singleton, company_name)
  VALUES (true, 'Pedra Silva Atelier')
  ON CONFLICT (singleton) DO NOTHING;

-- 4. Estados de factura
CREATE TYPE public.pm_invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- 5. Tabela pm_invoices
CREATE TABLE IF NOT EXISTS public.pm_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  status public.pm_invoice_status NOT NULL DEFAULT 'draft',
  raised_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  client_name TEXT NOT NULL DEFAULT '',
  client_address TEXT,
  client_nif TEXT,
  notes TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_invoices_project ON public.pm_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_invoices_status ON public.pm_invoices(status);

ALTER TABLE public.pm_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_invoices" ON public.pm_invoices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_invoices" ON public.pm_invoices
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_invoices" ON public.pm_invoices
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete pm_invoices" ON public.pm_invoices
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pm_invoices_updated_at
  BEFORE UPDATE ON public.pm_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Tabela pm_invoice_items (linhas de factura)
CREATE TABLE IF NOT EXISTS public.pm_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.pm_invoices(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.pm_stages(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_invoice_items_invoice ON public.pm_invoice_items(invoice_id);

ALTER TABLE public.pm_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_invoice_items" ON public.pm_invoice_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_invoice_items" ON public.pm_invoice_items
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update pm_invoice_items" ON public.pm_invoice_items
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete pm_invoice_items" ON public.pm_invoice_items
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pm_invoice_items_updated_at
  BEFORE UPDATE ON public.pm_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Trigger para criar rate inicial sempre que se cria um pm_resources
CREATE OR REPLACE FUNCTION public.pm_create_initial_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pm_resource_rates (resource_id, effective_from, cost_rate, sale_rate)
    VALUES (NEW.id, NEW.rate_effective_from, NEW.cost_rate, NEW.sale_rate)
    ON CONFLICT (resource_id, effective_from) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pm_create_initial_rate
  AFTER INSERT ON public.pm_resources
  FOR EACH ROW EXECUTE FUNCTION public.pm_create_initial_rate();

-- 8. Backfill: criar rate inicial para resources já existentes
INSERT INTO public.pm_resource_rates (resource_id, effective_from, cost_rate, sale_rate)
  SELECT id, rate_effective_from, cost_rate, sale_rate
  FROM public.pm_resources
  ON CONFLICT (resource_id, effective_from) DO NOTHING;

-- 9. Função helper: obter resource_id do utilizador autenticado (via collaborator email match)
CREATE OR REPLACE FUNCTION public.pm_get_my_resource_id()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id FROM public.pm_resources r
  WHERE r.email = (SELECT email FROM auth.users WHERE id = auth.uid())
     OR r.collaborator_id = public.get_my_collaborator_id()
  LIMIT 1
$$;