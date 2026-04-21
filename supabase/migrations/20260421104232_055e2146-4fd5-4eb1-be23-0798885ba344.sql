ALTER TABLE public.irs_tax_brackets
  ADD COLUMN IF NOT EXISTS formula_factor numeric,
  ADD COLUMN IF NOT EXISTS formula_constante numeric;

COMMENT ON COLUMN public.irs_tax_brackets.formula_factor IS 'Factor multiplicativo da fórmula dinâmica (ex: 2.60). Quando preenchido junto com formula_constante, a parcela a abater = taxa * formula_factor * (formula_constante - R).';
COMMENT ON COLUMN public.irs_tax_brackets.formula_constante IS 'Constante da fórmula dinâmica (ex: 1273.85). Ver formula_factor.';