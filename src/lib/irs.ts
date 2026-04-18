// Cálculo automático de IRS por taxa marginal segundo tabelas oficiais.
// Modelo: IRS = (rendimento * taxa) - parcela_abater - (n_dependentes * parcela_adicional)

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

/** Determina a tabela IRS aplicável consoante o agregado. */
export function pickTabela(estado_civil: string, numero_titulares: number): IrsTabela {
  if (estado_civil === "casado" || estado_civil === "uniao_facto") {
    return numero_titulares >= 2 ? "casado_dois_titulares" : "casado_unico_titular";
  }
  return "nao_casado";
}

/** Carrega escalões aplicáveis (cache leve por ano+local+tabela). */
const cache = new Map<string, IrsBracket[]>();

export async function loadBrackets(
  ano_fiscal: number,
  localizacao: string,
  tabela: IrsTabela,
): Promise<IrsBracket[]> {
  const key = `${ano_fiscal}|${localizacao}|${tabela}`;
  if (cache.has(key)) return cache.get(key)!;
  const { data, error } = await supabase
    .from