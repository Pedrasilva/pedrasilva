-- Tabela: saldo inicial por colaborador/categoria (definido pelo admin, uma linha por par)
CREATE TABLE public.benefit_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  categoria public.benefit_category NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collaborator_id, categoria)
);

ALTER TABLE public.benefit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage benefit_balances"
  ON public.benefit_balances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Collaborators read own benefit_balances"
  ON public.benefit_balances
  FOR SELECT TO authenticated
  USING (collaborator_id = public.get_my_collaborator_id());

CREATE TRIGGER trg_benefit_balances_updated_at
  BEFORE UPDATE ON public.benefit_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: crédito anual por colaborador/ano/categoria
CREATE TABLE public.benefit_yearly_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  ano_fiscal integer NOT NULL,
  categoria public.benefit_category NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collaborator_id, ano_fiscal, categoria)
);

ALTER TABLE public.benefit_yearly_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage benefit_yearly_credits"
  ON public.benefit_yearly_credits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Collaborators read own benefit_yearly_credits"
  ON public.benefit_yearly_credits
  FOR SELECT TO authenticated
  USING (collaborator_id = public.get_my_collaborator_id());

CREATE TRIGGER trg_benefit_yearly_credits_updated_at
  BEFORE UPDATE ON public.benefit_yearly_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_benefit_yearly_credits_collab_ano
  ON public.benefit_yearly_credits (collaborator_id, ano_fiscal);