// Helpers para o sistema de despesas de benefícios.
// Os tectos por categoria vêm da ficha salarial efectiva do colaborador.
//
// ---------------------------------------------------------------------------
// LEGACY `categoria` enum (Phase 1 — dual-write)
// ---------------------------------------------------------------------------
// `benefit_expenses.categoria` (enum BenefitCategory) é a coluna legada,
// usada por:
//   - `benefit_balances` / `benefit_yearly_credits` (saldos por categoria),
//   - `budgetsFromSnapshot()` que mapeia colunas da ficha salarial,
//   - cálculo de saldo disponível em `balanceByCategory()`.
//
// Em Phase 1b foi adicionada a tabela `benefit_categories` com `category_id`
// (FK) em `benefit_expenses`. O fluxo de submissão faz DUAL-WRITE:
//   1. `categoria` (legacy enum, fallback "outros") — alimenta saldos,
//   2. `category_id` (FK para benefit_categories) — alimenta UI/relatórios.
//
// A view `benefit_expenses_v` resolve `category_code`/`category_label_*`
// para o frontend. O helper `expenseCategoryLabel()` deve ser o ÚNICO
// ponto de renderização da categoria em UI.
//
// MIGRAÇÃO FUTURA (Phase 2+, fora de scope):
//   - mover saldos para a chave `category_id`,
//   - backfill `category_id` em registos antigos,
//   - eventualmente remover a coluna `categoria` e o enum.
// NÃO remover dual-write enquanto saldos dependerem do enum.
// ---------------------------------------------------------------------------

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

// =============================================================
// Saldos acumulados
// =============================================================

export type BenefitBalance = {
  id: string;
  collaborator_id: string;
  categoria: BenefitCategory;
  saldo_inicial: number;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export type BenefitYearlyCredit = {
  id: string;
  collaborator_id: string;
  ano_fiscal: number;
  categoria: BenefitCategory;
  valor: number;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

const CATEGORIES: BenefitCategory[] = ["carro", "ticket", "premio", "outros"];

// =============================================================
// Categorias dinâmicas (Phase 1b — tabela benefit_categories)
// =============================================================

export type BenefitCategoryRow = {
  id: string;
  code: string;
  label_pt: string;
  label_en: string;
  icon: string | null;
  legacy_enum: BenefitCategory | null;
  sort_order: number;
  active: boolean;
};

/** Label da categoria a partir de uma linha de benefit_categories. */
export function categoryLabel(row: BenefitCategoryRow, locale: "pt" | "en" = "pt"): string {
  return locale === "en" ? row.label_en : row.label_pt;
}

/** Tipo da linha da view benefit_expenses_v (BenefitExpense + colunas resolvidas). */
export type BenefitExpenseRow = BenefitExpense & {
  category_code: string | null;
  category_label_pt: string | null;
  category_label_en: string | null;
  // Phase 2b: read-only finance backlink (NULL until expense is approved)
  finance_item_id: string | null;
  finance_status: string | null;
  finance_due_date: string | null;
  finance_paid_date: string | null;
  finance_period_id: string | null;
};

/** Label para mostrar uma despesa, preferindo a categoria nova. */
export function expenseCategoryLabel(e: BenefitExpenseRow, locale: "pt" | "en" = "pt"): string {
  const v = locale === "en" ? e.category_label_en : e.category_label_pt;
  if (v) return v;
  return CATEGORY_LABELS[e.categoria];
}

const emptyByCat = <T>(zero: T): Record<BenefitCategory, T> => ({
  carro: zero,
  ticket: zero,
  premio: zero,
  outros: zero,
});

/** Soma os saldos iniciais por categoria. */
export function initialByCategory(
  balances: BenefitBalance[],
): Record<BenefitCategory, number> {
  const acc = emptyByCat(0);
  for (const b of balances) acc[b.categoria] += Number(b.saldo_inicial) || 0;
  return acc;
}

/** Soma os créditos anuais por categoria (todos os anos). */
export function creditedByCategory(
  credits: BenefitYearlyCredit[],
): Record<BenefitCategory, number> {
  const acc = emptyByCat(0);
  for (const c of credits) acc[c.categoria] += Number(c.valor) || 0;
  return acc;
}

/**
 * Saldo disponível por categoria:
 * disponível = saldo_inicial + Σ(créditos anuais) − Σ(despesas pendentes+aprovadas+pagas)
 *
 * Devolve também os componentes para a UI mostrar o detalhe.
 */
export function balanceByCategory(input: {
  balances: BenefitBalance[];
  credits: BenefitYearlyCredit[];
  expenses: BenefitExpense[];
}): Record<
  BenefitCategory,
  { inicial: number; creditado: number; gasto: number; disponivel: number }
> {
  const ini = initialByCategory(input.balances);
  const cred = creditedByCategory(input.credits);
  const cons = consumedByCategory(input.expenses);
  const out = {} as Record<
    BenefitCategory,
    { inicial: number; creditado: number; gasto: number; disponivel: number }
  >;
  for (const c of CATEGORIES) {
    const inicial = ini[c];
    const creditado = cred[c];
    const gasto = cons[c].total;
    out[c] = {
      inicial,
      creditado,
      gasto,
      disponivel: inicial + creditado - gasto,
    };
  }
  return out;
}
