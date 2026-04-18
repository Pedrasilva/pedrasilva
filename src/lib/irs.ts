// Cálculo automático de IRS por taxa marginal segundo tabelas oficiais.
// Modelo: IRS_mensal = (rendimento * taxa) - parcela_abater - (n_dependentes * parcela_adicional)

import { supabase } from "@/integrations/supabase/client";

export type IrsTabela = "nao_casado" | "casado_unico_titular" | "casado_dois_titulares";

export type IrsBracket = {
  ano_fiscal: number;
  localizacao: string;
  tabela: string;
  numero_dependentes: number;
  rendimento_min: number;
  rendimento_max: number | null;
  taxa: number;
  parcela_abater: number;
  parcela_adicional_por_dependente: number;
};

export type IrsContexto = {
  ano_fiscal: number;
  localizacao: string;
  estado_civil: string;
  numero_titulares: number;
  numero_dependentes: number;
};

export type IrsResultado = {
  taxa_marginal: number;
  parcela_abater: number;
  parcela_adicional: number;
  irs_mensal: number;
  irs_pct_efectiva: number;
  bracket?: IrsBracket;
};

/** Determina a tabela IRS aplicável consoante o agregado. */
export function pickTabela(estado_civil: string, numero_titulares: number): IrsTabela {
  if (estado_civil === "casado" || estado_civil === "uniao_facto") {
    return numero_titulares >= 2 ? "casado_dois_titulares" : "casado_unico_titular";
  }
  return "nao_casado";
}

const cache = new Map<string, IrsBracket[]>();

export async function loadBrackets(
  ano_fiscal: number,
  localizacao: string,
  tabela: IrsTabela,
): Promise<IrsBracket[]> {
  const key = `${ano_fiscal}|${localizacao}|${tabela}`;
  if (cache.has(key)) return cache.get(key)!;
  const { data, error } = await supabase
    .from("irs_tax_brackets")
    .select("*")
    .eq("ano_fiscal", ano_fiscal)
    .eq("localizacao", localizacao)
    .eq("tabela", tabela)
    .order("rendimento_min", { ascending: true });
  if (error) throw error;
  const list = (data ?? []) as IrsBracket[];
  cache.set(key, list);
  return list;
}

/** Calcula IRS dado um rendimento bruto mensal e os escalões já carregados. */
export function calcIrs(
  rendimento_mensal: number,
  brackets: IrsBracket[],
  numero_dependentes = 0,
): IrsResultado {
  if (rendimento_mensal <= 0 || brackets.length === 0) {
    return { taxa_marginal: 0, parcela_abater: 0, parcela_adicional: 0, irs_mensal: 0, irs_pct_efectiva: 0 };
  }
  const b = brackets.find(
    (br) =>
      rendimento_mensal >= br.rendimento_min &&
      (br.rendimento_max == null || rendimento_mensal <= br.rendimento_max),
  );
  if (!b) {
    return { taxa_marginal: 0, parcela_abater: 0, parcela_adicional: 0, irs_mensal: 0, irs_pct_efectiva: 0 };
  }
  const parcela_adicional = (b.parcela_adicional_por_dependente ?? 0) * numero_dependentes;
  const irs = Math.max(0, rendimento_mensal * b.taxa - b.parcela_abater - parcela_adicional);
  return {
    taxa_marginal: b.taxa,
    parcela_abater: b.parcela_abater,
    parcela_adicional,
    irs_mensal: irs,
    irs_pct_efectiva: rendimento_mensal > 0 ? irs / rendimento_mensal : 0,
    bracket: b,
  };
}

/** Helper completo: carrega tabela e calcula. */
export async function calcIrsAuto(
  rendimento_mensal: number,
  ctx: IrsContexto,
): Promise<IrsResultado> {
  const tabela = pickTabela(ctx.estado_civil, ctx.numero_titulares);
  const brackets = await loadBrackets(ctx.ano_fiscal, ctx.localizacao, tabela);
  return calcIrs(rendimento_mensal, brackets, ctx.numero_dependentes);
}

export const ESTADOS_CIVIS = [
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "uniao_facto", label: "União de facto" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
] as const;

export const LOCALIZACOES = [
  { value: "continente", label: "Continente" },
  { value: "acores", label: "Açores" },
  { value: "madeira", label: "Madeira" },
] as const;
