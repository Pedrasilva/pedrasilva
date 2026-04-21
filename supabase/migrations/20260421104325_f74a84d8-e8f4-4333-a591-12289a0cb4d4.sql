-- nao_casado (Tabela I) — sem dependentes
UPDATE public.irs_tax_brackets SET formula_factor = 2.60, formula_constante = 1273.85
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='nao_casado'
    AND numero_dependentes=0 AND rendimento_min=920.01;
UPDATE public.irs_tax_brackets SET formula_factor = 1.35, formula_constante = 1554.83
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='nao_casado'
    AND numero_dependentes=0 AND rendimento_min=1042.01;

-- nao_casado (Tabela II) — com dependentes
UPDATE public.irs_tax_brackets SET formula_factor = 2.60, formula_constante = 1273.85
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='nao_casado'
    AND numero_dependentes=1 AND rendimento_min=920.01;
UPDATE public.irs_tax_brackets SET formula_factor = 1.35, formula_constante = 1554.83
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='nao_casado'
    AND numero_dependentes=1 AND rendimento_min=1042.01;

-- casado_dois_titulares (Tabela I)
UPDATE public.irs_tax_brackets SET formula_factor = 2.60, formula_constante = 1273.85
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='casado_dois_titulares'
    AND rendimento_min=920.01;
UPDATE public.irs_tax_brackets SET formula_factor = 1.35, formula_constante = 1554.83
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='casado_dois_titulares'
    AND rendimento_min=1042.01;

-- casado_unico_titular (Tabela III)
UPDATE public.irs_tax_brackets SET formula_factor = 2.60, formula_constante = 1372.15
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='casado_unico_titular'
    AND rendimento_min=991.01;
UPDATE public.irs_tax_brackets SET formula_factor = 1.35, formula_constante = 1677.85
  WHERE ano_fiscal=2026 AND localizacao='continente' AND tabela='casado_unico_titular'
    AND rendimento_min=1042.01;