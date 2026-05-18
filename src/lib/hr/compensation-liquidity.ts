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
};

/**
 * Média mensal de benefícios/reembolsos. Considera despesas pendentes,
 * aprovadas e pagas (consomem o orçamento e correspondem a valor que o
 * colaborador recebe ou vai receber). Rejeitadas são ignoradas.
 *
 * Janela móvel: últimos N meses (default 12) a partir de `now`.
 * Divide sempre por N para suavizar — meses sem despesas baixam a média,
 * meses com pico não a distorcem.
 */
export function computeAverageBenefits(
  expenses: BenefitExpense[],
  opts: AverageBenefitsOptions = {},
): number {
  const now = opts.now ?? new Date();
  const windowMonths = opts.windowMonths ?? 12;
  if (windowMonths <= 0) return 0;
  const from = new Date(now);
  from.setMonth(from.getMonth() - windowMonths);
  const fromMs = from.getTime();
  const nowMs = now.getTime();
  let sum = 0;
  for (const e of expenses) {
    if (e.estado === "rejeitada") continue;
    const t = e.data_despesa ? new Date(e.data_despesa).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    if (t < fromMs || t > nowMs) continue;
    sum += Number(e.valor) || 0;
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
