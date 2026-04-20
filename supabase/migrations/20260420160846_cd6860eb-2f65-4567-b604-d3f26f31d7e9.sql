
-- Enum for proposal pipeline status
CREATE TYPE public.proposal_status AS ENUM ('lead', 'proposta_enviada', 'negociacao', 'ganho', 'perdido');

-- Enum for CRM activity type
CREATE TYPE public.crm_activity_type AS ENUM ('chamada', 'email', 'reuniao', 'nota', 'outro');

-- Fee proposals table
CREATE TABLE public.fee_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  probabilidade INTEGER NOT NULL DEFAULT 50,
  pipeline_status public.proposal_status NOT NULL DEFAULT 'lead',
  data_proposta DATE DEFAULT CURRENT_DATE,
  data_decisao DATE,
  pm_project_id UUID REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read fee_proposals" ON public.fee_proposals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert fee_proposals" ON public.fee_proposals
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update fee_proposals" ON public.fee_proposals
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete fee_proposals" ON public.fee_proposals
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_fee_proposals_updated_at
  BEFORE UPDATE ON public.fee_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRM activities table
CREATE TABLE public.crm_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo public.crm_activity_type NOT NULL DEFAULT 'nota',
  resumo TEXT NOT NULL,
  detalhes TEXT,
  data_actividade TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read crm_activities" ON public.crm_activities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert crm_activities" ON public.crm_activities
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update crm_activities" ON public.crm_activities
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete crm_activities" ON public.crm_activities
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_crm_activities_updated_at
  BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_fee_proposals_company ON public.fee_proposals(company_id);
CREATE INDEX idx_fee_proposals_status ON public.fee_proposals(pipeline_status);
CREATE INDEX idx_crm_activities_company ON public.crm_activities(company_id);
CREATE INDEX idx_crm_activities_proposal ON public.crm_activities(proposal_id);
