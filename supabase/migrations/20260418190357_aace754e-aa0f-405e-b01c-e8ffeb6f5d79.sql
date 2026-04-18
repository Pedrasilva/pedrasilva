
-- ============================================
-- COMPANIES, CONTACTS, PROJECTS (CRM básico)
-- ============================================

-- Enums
CREATE TYPE public.company_status AS ENUM ('activo', 'prospecto', 'inactivo');
CREATE TYPE public.project_status AS ENUM ('proposta', 'em_curso', 'pausado', 'concluido', 'cancelado');

-- Tabela companies
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  website TEXT,
  email TEXT,
  telefone TEXT,
  morada TEXT,
  status public.company_status NOT NULL DEFAULT 'activo',
  industria TEXT,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read companies" ON public.companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update companies" ON public.companies
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete companies" ON public.companies
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela contacts
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  primeiro_nome TEXT NOT NULL,
  apelido TEXT,
  titulo TEXT,
  email TEXT,
  telefone TEXT,
  telemovel TEXT,
  posicao TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contacts" ON public.contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert contacts" ON public.contacts
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update contacts" ON public.contacts
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete contacts" ON public.contacts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_contacts_company_id ON public.contacts(company_id);

-- Tabela projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL,
  data_inicio DATE,
  data_fim DATE,
  status public.project_status NOT NULL DEFAULT 'proposta',
  orcamento NUMERIC(12,2),
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read projects" ON public.projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update projects" ON public.projects
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete projects" ON public.projects
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_projects_company_id ON public.projects(company_id);
CREATE INDEX idx_projects_responsavel_id ON public.projects(responsavel_id);
