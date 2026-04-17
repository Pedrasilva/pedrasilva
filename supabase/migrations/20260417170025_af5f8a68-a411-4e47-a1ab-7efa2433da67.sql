-- Departamento enum
CREATE TYPE public.department AS ENUM ('Projecto', 'Backoffice');

-- Colaboradores
CREATE TABLE public.collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_colaborador TEXT,
  nome TEXT NOT NULL,
  data_nascimento DATE,
  inicio_carreira DATE,
  situacao_contractual TEXT,
  departamento public.department NOT NULL DEFAULT 'Projecto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshots salariais (cada um é uma "ficha" para uma data)
CREATE TABLE public.salary_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                   -- "Actual", "Proposto", livre
  reference_date DATE NOT NULL,
  is_effective BOOLEAN NOT NULL DEFAULT false, -- marca as fichas efectivas (vs. propostas)
  -- Inputs (células amarelas)
  valor_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  ss_atelier_pct NUMERIC(6,4) NOT NULL DEFAULT 0.2375,
  ss_colaborador_pct NUMERIC(6,4) NOT NULL DEFAULT 0.11,
  irs_pct NUMERIC(6,4) NOT NULL DEFAULT 0,
  meses_pagos INTEGER NOT NULL DEFAULT 14,
  subsidio_alimentacao_diario NUMERIC(10,2) NOT NULL DEFAULT 0,
  dias_uteis INTEGER NOT NULL DEFAULT 220,
  ajudas_custo_anual NUMERIC(12,2) NOT NULL DEFAULT 0,
  beneficio_carro NUMERIC(12,2) NOT NULL DEFAULT 0,
  beneficio_ticket NUMERIC(12,2) NOT NULL DEFAULT 0,
  premio_associado NUMERIC(12,2) NOT NULL DEFAULT 0,
  outros_beneficios NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_collab ON public.salary_snapshots(collaborator_id, reference_date DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_collaborators_updated BEFORE UPDATE ON public.collaborators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_snapshots_updated BEFORE UPDATE ON public.salary_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: app interna sem autenticação por enquanto -> acesso público (anon)
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read collaborators" ON public.collaborators FOR SELECT USING (true);
CREATE POLICY "public write collaborators" ON public.collaborators FOR INSERT WITH CHECK (true);
CREATE POLICY "public update collaborators" ON public.collaborators FOR UPDATE USING (true);
CREATE POLICY "public delete collaborators" ON public.collaborators FOR DELETE USING (true);

CREATE POLICY "public read snapshots" ON public.salary_snapshots FOR SELECT USING (true);
CREATE POLICY "public write snapshots" ON public.salary_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "public update snapshots" ON public.salary_snapshots FOR UPDATE USING (true);
CREATE POLICY "public delete snapshots" ON public.salary_snapshots FOR DELETE USING (true);