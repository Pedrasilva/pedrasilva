-- Enum com tipos de pedido (essenciais segundo o Código do Trabalho português)
CREATE TYPE public.absence_type AS ENUM (
  'ferias',
  'casamento',
  'falecimento_familiar',
  'assistencia_filho',
  'nascimento_filho',
  'trabalhador_estudante',
  'doacao_sangue',
  'autorizada_paga',
  'autorizada_nao_paga'
);

-- Adicionar coluna tipo a vacation_requests, com default 'ferias' para registos existentes
ALTER TABLE public.vacation_requests
  ADD COLUMN tipo public.absence_type NOT NULL DEFAULT 'ferias';

-- Índice para filtros por tipo
CREATE INDEX IF NOT EXISTS idx_vacation_requests_tipo ON public.vacation_requests (tipo);