-- Enum para estado da despesa
CREATE TYPE public.expense_status AS ENUM ('pendente', 'aprovada', 'rejeitada', 'paga');

-- Enum para categoria do benefício (alinhado com a ficha salarial)
CREATE TYPE public.benefit_category AS ENUM ('carro', 'ticket', 'premio', 'outros');

-- Tabela de despesas de benefícios
CREATE TABLE public.benefit_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  ano_fiscal INTEGER NOT NULL DEFAULT 2026,
  categoria public.benefit_category NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  data_despesa DATE NOT NULL,
  foto_path TEXT,
  estado public.expense_status NOT NULL DEFAULT 'pendente',
  notas_colaborador TEXT,
  notas_aprovacao TEXT,
  aprovado_por UUID,
  aprovado_em TIMESTAMP WITH TIME ZONE,
  pago_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_benefit_expenses_collab ON public.benefit_expenses(collaborator_id, ano_fiscal);
CREATE INDEX idx_benefit_expenses_estado ON public.benefit_expenses(estado);

ALTER TABLE public.benefit_expenses ENABLE ROW LEVEL SECURITY;

-- RLS: colaboradores vêem as suas próprias; admins vêem todas
CREATE POLICY "Users see own expenses + admins all"
ON public.benefit_expenses FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR collaborator_id = get_my_collaborator_id());

-- Colaboradores criam as suas próprias; admins criam quaisquer
CREATE POLICY "Users create own expenses"
ON public.benefit_expenses FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR collaborator_id = get_my_collaborator_id());

-- Colaboradores editam só pendentes próprias; admins editam tudo
CREATE POLICY "Admins update; users update own pending expenses"
ON public.benefit_expenses FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR (collaborator_id = get_my_collaborator_id() AND estado = 'pendente'));

-- Colaboradores apagam só pendentes próprias; admins apagam tudo
CREATE POLICY "Admins delete; users delete own pending expenses"
ON public.benefit_expenses FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR (collaborator_id = get_my_collaborator_id() AND estado = 'pendente'));

-- Trigger updated_at
CREATE TRIGGER update_benefit_expenses_updated_at
BEFORE UPDATE ON public.benefit_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket privado para as facturas
INSERT INTO storage.buckets (id, name, public)
VALUES ('benefit-receipts', 'benefit-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: ficheiros organizados por collaborator_id no path (primeira pasta)
CREATE POLICY "Users read own receipts + admins all"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'benefit-receipts' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = get_my_collaborator_id()::text
  )
);

CREATE POLICY "Users upload own receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'benefit-receipts' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = get_my_collaborator_id()::text
  )
);

CREATE POLICY "Users delete own receipts + admins all"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'benefit-receipts' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = get_my_collaborator_id()::text
  )
);