// Helpers para o sistema de despesas de benefícios.
// Os tectos por categoria vêm da ficha salarial efectiva do colaborador.

import type { Snapshot } from "./salary";

export type BenefitCategory = "carro" | "ticket" | "premio" | "outros";

export type ExpenseStatus = "pendente" | "aprovada" | "rejeitada" | "paga";

export type BenefitExpense = {
  id: string;
  collaborator_id: string;
  ano_fiscal: number;
  categoria: BenefitCategory;
  descricao: string;
  valor: number;
  data_despesa: string;
  foto_path: string | null;
  estado: ExpenseStatus;
  notas_colaborador: string | null;
  notas_aprovacao: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  pago_em: string | null;
  created_at: string;
  updated_at: string;
};

export const CATEGORY_LABELS: Record<BenefitCategory, string> = {
  carro: "Carro",
  ticket: "Ticket / Cartão refeição",
  premio: "Prémio associado",
  outros: "Outros benefícios",
};

export const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  paga: "Paga",
};

export const STATUS_COLORS: Record<ExpenseStatus, string> = {
  pendente: "bg-amber-100 text-amber-900 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-900 border-emerald-200",
  rejeitada: "bg-rose-100 text-rose-900 border-rose-200",
  paga: "bg-sky-100 text-sky-900 border-sky-200",
};

/** Tecto anual por categoria a partir da ficha salarial efectiva. */
export function budgetsFromSnapshot(snap: Snapshot | null | undefined): Record<BenefitCategory, number> {
  return {
    carro: snap?.beneficio_carro ?? 0,
    ticket: snap?.beneficio_ticket ?? 0,
    premio: snap?.premio_associado ?? 0,
    outros: snap?.outros_beneficios ?? 0,
  };
}

/** Soma de despesas por categoria, considerando apenas as que "consomem" orçamento (pendentes, aprovadas, pagas). */
export function consumedByCategory(
  expenses: BenefitExpense[],
): Record<BenefitCategory, { pendente: number; aprovada: number; paga: number; total: number }> {
  const init = () => ({ pendente: 0, aprovada: 0, paga: 0, total: 0 });
  const acc: Record<BenefitCategory, ReturnType<typeof init>> = {
    carro: init(),
    ticket: init(),
    premio: init(),
    outros: init(),
  };
  for (const e of expenses) {
    if (e.estado === "rejeitada") continue;
    const v = Number(e.valor) || 0;
    acc[e.categoria][e.estado as "pendente" | "aprovada" | "paga"] += v;
    acc[e.categoria].total += v;
  }
  return acc;
}
