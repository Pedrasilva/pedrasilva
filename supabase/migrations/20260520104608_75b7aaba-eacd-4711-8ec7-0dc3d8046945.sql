
-- Additive proposal role abstraction columns
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS proposal_role text,
  ADD COLUMN IF NOT EXISTS billing_role text,
  ADD COLUMN IF NOT EXISTS seniority_level integer;

ALTER TABLE public.pm_resources
  ADD COLUMN IF NOT EXISTS proposal_role text,
  ADD COLUMN IF NOT EXISTS billing_role text,
  ADD COLUMN IF NOT EXISTS seniority_level integer;

-- Catalog of proposal-facing roles
CREATE TABLE IF NOT EXISTS public.proposal_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_en text NOT NULL,
  label_pt text NOT NULL,
  default_seniority integer,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_roles_read_authenticated" ON public.proposal_roles;
CREATE POLICY "proposal_roles_read_authenticated"
  ON public.proposal_roles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "proposal_roles_write_admin" ON public.proposal_roles;
CREATE POLICY "proposal_roles_write_admin"
  ON public.proposal_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_proposal_roles_updated_at
  BEFORE UPDATE ON public.proposal_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.proposal_roles (code, label_en, label_pt, default_seniority, sort_order) VALUES
  ('partner',              'Partner',              'Sócio',                  90, 10),
  ('director',             'Director',             'Diretor',                80, 20),
  ('senior_architect',     'Senior Architect',     'Arquiteto Sénior',       70, 30),
  ('architect',            'Architect',            'Arquiteto',              50, 40),
  ('junior_architect',     'Junior Architect',     'Arquiteto Júnior',       30, 50),
  ('bim_coordinator',      'BIM Coordinator',      'Coordenador BIM',        60, 60),
  ('interior_architect',   'Interior Architect',   'Arquiteto de Interiores',50, 70),
  ('technical_coordinator','Technical Coordinator','Coordenador Técnico',    65, 80)
ON CONFLICT (code) DO NOTHING;
