// Cálculo automático de IRS por taxa marginal segundo tabelas oficiais.
// Modelo: IRS = (rendimento * taxa) - parcela_abater - (n_dependentes * parcela_adicional_por_dependente)

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
  dependentes_com_deficiencia: number;
};

/**
 * Determina qual tabela IRS aplicar consoante o agregado familiar.
 */
export function pickTabela(estado_civil: string, numero_titulares: number): IrsTabela {
  if (estado_civil === "casado" ||