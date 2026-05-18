// Compensação líquida percebida pelo colaborador.
//
// Camada puramente analítica — NÃO altera payroll, finance ou contabilidade.
// Distinguimos:
//   • Líquido salarial  = líquido mensal médio + subsídio de alimentação
//   • Liquidez mensal total = líquido salarial + passe + ajudas + média de
//     benefícios/reembolsos efectivamente pagos nos últimos 12 meses.
//
// A média de benefícios usa uma janela móvel de 12 meses (apanha o ciclo
// anual completo dos tectos por categoria e neutraliza meses excepcionais).
// Funções puras — calculam dinâmicamente, nunca persistir.

import { computeSnapshot, type Snapshot } from "@/lib/salary";
import type { BenefitExpense } from "@/lib/benefits";

export type LiquidityBreakdown = {
  netSalary: number;       // líquido mensal médio (12)
  mealAllowance: number;   // subsídio de alimentação mensal
  perDiem: number;         // ajudas de custo mensais
  transitPass: number;     // passe mensal
  avgBenefits: number;     // média mensal de benefícios pagos/em curso (12m)
  netCompensation: number; // = netSalary + mealAllowance  ("líquido salarial")
  total: number;           // = liquidez mensal total
};

export function computeNetSalary(snapshot: Snapshot): number {
  return computeSnapshot(snapshot).liquido12m;
}

export function computeMealAllowance(snapshot: Snapshot): number {
  return computeSnapshot(snapshot).alimentacaoMensal;
}

export function computePerDiem(snapshot: Snapshot): number {
  return computeSnapshot(snapshot).ajudasMensal;
}

export function computeTransitPass(snapshot: Snapshot): number {
  return computeSnapshot(snapshot).passeMensal;
}

export type AverageBenefitsOptions = {
  /** Data de referência (default = agora). Útil para testes. */
  now?: Date;
  /** Janela em meses (default = 12). */
  windowMonths?: number;
  /**
   * Estados a considerar. Default: aprovada + paga + pendente — representam
   * valor que o colaborador recebeu ou vai receber. Rejeitadas nunca contam.
   */
  eligibleStates?: ReadonlyArray<"pendente" | "aprovada" | "paga">;
  /**
   * Categorias elegíveis (subset do enum legacy). Default = todas. Permite
   * excluir tipos de despesa que não devem entrar na liquidez percebida.
   */
  eligibleCategories?: ReadonlyArray<BenefitExpense["categoria"]>;
  /**
   * Tecto absoluto por despesa individual. Despesas acima deste valor são
   * tratadas como outliers (compra única grande: portátil, viagem rara,
   * equipamento) e excluídas do cálculo da média mensal. Default = 500€.
   * Passar `null` para desactivar a regra.
   */
  outlierThreshold?: number | null;
};

const DEFAULT_ELIGIBLE_STATES: ReadonlyArray<"pendente" | "aprovada" | "paga"> = [
  "aprovada",
  "paga",
];

/** Tecto por defeito para considerar uma despesa "extraordinária". */
export const DEFAULT_OUTLIER_THRESHOLD = 500;

/**
 * Média mensal de benefícios/reembolsos efectivamente percebidos pelo
 * colaborador. Calcula sempre por NORMALIZAÇÃO TEMPORAL:
 *
 *     media_mensal = Σ(elegíveis na janela) / windowMonths
 *
 * Regras (alinhadas com a leitura "liquidez percebida", não custo da empresa):
 *  • janela móvel default 12 meses,
 *  • só estados aprovada/paga (configurável),
 *  • categorias elegíveis configuráveis (default = todas),
 *  • despesas acima do tecto de outlier excluídas (default 500€/despesa)
 *    para evitar que compras únicas grandes distorçam a média,
 *  • rejeitadas nunca contam.
 *
 * Função pura — nunca persistir.
 */
export function computeAverageBenefits(
  expenses: BenefitExpense[],
  opts: AverageBenefitsOptions = {},
): number {
  const now = opts.now ?? new Date();
  const windowMonths = opts.windowMonths ?? 12;
  if (windowMonths <= 0) return 0;
  const states = new Set(opts.eligibleStates ?? DEFAULT_ELIGIBLE_STATES);
  const cats = opts.eligibleCategories
    ? new Set(opts.eligibleCategories)
    : null;
  const outlier =
    opts.outlierThreshold === undefined
      ? DEFAULT_OUTLIER_THRESHOLD
      : opts.outlierThreshold;
  const from = new Date(now);
  from.setMonth(from.getMonth() - windowMonths);
  const fromMs = from.getTime();
  const nowMs = now.getTime();
  let sum = 0;
  for (const e of expenses) {
    if (e.estado === "rejeitada") continue;
    if (!states.has(e.estado as "pendente" | "aprovada" | "paga")) continue;
    if (cats && !cats.has(e.categoria)) continue;
    const t = e.data_despesa ? new Date(e.data_despesa).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    if (t < fromMs || t > nowMs) continue;
    const v = Number(e.valor) || 0;
    if (v <= 0) continue;
    if (outlier != null && v > outlier) continue;
    sum += v;
  }
  return sum / windowMonths;
}

export type MonthlyLiquidityInput = {
  snapshot: Snapshot | null | undefined;
  expenses?: BenefitExpense[];
  now?: Date;
  windowMonths?: number;
};

export function computeMonthlyLiquidity({
  snapshot,
  expenses = [],
  now,
  windowMonths,
}: MonthlyLiquidityInput): LiquidityBreakdown {
  if (!snapshot) {
    return {
      netSalary: 0,
      mealAllowance: 0,
      perDiem: 0,
      transitPass: 0,
      avgBenefits: 0,
      netCompensation: 0,
      total: 0,
    };
  }
  const c = computeSnapshot(snapshot);
  const avgBenefits = computeAverageBenefits(expenses, { now, windowMonths });
  const netCompensation = c.liquido12m + c.alimentacaoMensal;
  const total =
    netCompensation + c.passeMensal + c.ajudasMensal + avgBenefits;
  return {
    netSalary: c.liquido12m,
    mealAllowance: c.alimentacaoMensal,
    perDiem: c.ajudasMensal,
    transitPass: c.passeMensal,
    avgBenefits,
    netCompensation,
    total,
  };
}
