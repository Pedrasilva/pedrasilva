-- 1) Novos campos na tabela de snapshots
ALTER TABLE public.salary_snapshots
  ADD COLUMN IF NOT EXISTS localizacao text NOT NULL DEFAULT 'continente',
  ADD COLUMN IF NOT EXISTS estado_civil text NOT NULL DEFAULT 'solteiro',
  ADD COLUMN IF NOT EXISTS numero_titulares integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS numero_dependentes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dependentes_com_deficiencia integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ano_fiscal integer NOT NULL DEFAULT 2026,
  ADD COLUMN IF NOT EXISTS irs_calculado_auto boolean NOT NULL DEFAULT false;

-- Constraints sensatos
ALTER TABLE public.salary_snapshots
  DROP CONSTRAINT IF EXISTS salary_snapshots_localizacao_check;
ALTER TABLE public.salary_snapshots
  ADD CONSTRAINT salary_snapshots_localizacao_check
    CHECK (localizacao IN ('continente','acores','madeira'));

ALTER TABLE public.salary_snapshots
  DROP CONSTRAINT IF EXISTS salary_snapshots_estado_civil_check;
ALTER TABLE public.salary_snapshots
  ADD CONSTRAINT salary_snapshots_estado_civil_check
    CHECK (estado_civil IN ('solteiro','casado'));

ALTER TABLE public.salary_snapshots
  DROP CONSTRAINT IF EXISTS salary_snapshots_titulares_check;
ALTER TABLE public.salary_snapshots
  ADD CONSTRAINT salary_snapshots_titulares_check
    CHECK (numero_titulares IN (1,2));

-- Snapshots existentes vieram do Excel antigo → assumimos tabelas IRS 2023
UPDATE public.salary_snapshots
   SET ano_fiscal = 2023
 WHERE created_at < now();

-- 2) Tabela de escalões de IRS (retenção na fonte)
CREATE TABLE IF NOT EXISTS public.irs_tax_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_fiscal integer NOT NULL,
  localizacao text NOT NULL CHECK (localizacao IN ('continente','acores','madeira')),
  tabela text NOT NULL CHECK (tabela IN (
    'nao_casado',
    'casado_unico_titular',
    'casado_dois_titulares'
  )),
  numero_dependentes integer NOT NULL DEFAULT 0,
  rendimento_min numeric NOT NULL,
  rendimento_max numeric,
  taxa numeric NOT NULL,
  parcela_abater numeric NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS irs_tax_brackets_lookup_idx
  ON public.irs_tax_brackets (ano_fiscal, localizacao, tabela, numero_dependentes, rendimento_min);

ALTER TABLE public.irs_tax_brackets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read irs_tax_brackets" ON public.irs_tax_brackets;
CREATE POLICY "Authenticated read irs_tax_brackets"
  ON public.irs_tax_brackets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins insert irs_tax_brackets" ON public.irs_tax_brackets;
CREATE POLICY "Admins insert irs_tax_brackets"
  ON public.irs_tax_brackets FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update irs_tax_brackets" ON public.irs_tax_brackets;
CREATE POLICY "Admins update irs_tax_brackets"
  ON public.irs_tax_brackets FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete irs_tax_brackets" ON public.irs_tax_brackets;
CREATE POLICY "Admins delete irs_tax_brackets"
  ON public.irs_tax_brackets FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_irs_tax_brackets_updated_at ON public.irs_tax_brackets;
CREATE TRIGGER update_irs_tax_brackets_updated_at
  BEFORE UPDATE ON public.irs_tax_brackets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();