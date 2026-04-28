// Finance-perspective view of a single salary snapshot.
//
// `computeSnapshot` (src/lib/salary.ts) is the authoritative payroll
// calculator and serves the HR module (employee perspective: gross, net,
// IRS, food allowance, benefits). The Finance dashboard needs the same
// numbers but framed as monthly company cost.
//
// This file does NOT duplicate the math — it re-uses computeSnapshot and
// surfaces only the finance-relevant fields with explicit assumption
// labels so dashboards/reports can render them without re-deriving rules.
//
// Assumptions (kept identical to computeSnapshot):
// - Employer Social Security (TSU) is `valor_base × meses × ss_atelier_pct`.
// - "Meses pagos" comes from the chosen `subsidios_modo`:
//     tradicional       → 14   (12 monthly + Junho/Novembro subsídios)
//     duodecimos_50     → 13   (subsídios half-diluted, half paid in full)
//     duodecimos_100    → 14   (fully diluted across 12 monthly payments)
// - Food allowance (subsídio de alimentação) annual = daily rate × dias_uteis.
// - Per diem (ajudas de custo) is annual; monthly = annual / 12.
// - Benefits (car, ticket, prémio, others, variável) are annual.
// - Total annual company cost = bruto anual + benefits + per diem.
//   Average monthly company cost = total annual cost / 12.
//
// All amounts in EUR. Display rounding lives in `display-rules.ts`.

import { computeSnapshot, type Snapshot } from "@/lib/salary";

export type MonthlyCompanyCost = {
  /** Average gross monthly cost — `valor_base × meses / 12 + employer SS share + meal + per diem`. */
  monthlyAverage: number;
  /** Sum across the year: gross annual + benefits + per diem. */
  annualTotal: number;
  /** Components, useful for breakdowns and tooltips. */
  components: {
    baseMonthly: number;
    employerSocialSecurityMonthly: number;
    foodAllowanceMonthly: number;
    perDiemMonthly: number;
    benefitsAnnual: number;
  };
};

/**
 * Composite monthly company cost for one salary snapshot.
 *
 * Returns `null` for absent snapshots so callers can render "—" cleanly.
 */
export function computeMonthlyCompanyCost(
  snapshot: Snapshot | null | undefined,
): MonthlyCompanyCost | null {
  if (!snapshot) return null;
  const c = computeSnapshot(snapshot);
  return {
    monthlyAverage: c.brutoMensal,
    annualTotal: c.custoVBG,
    components: {
      baseMonthly: c.baseMensal12,
      employerSocialSecurityMonthly: c.ssAtelier12,
      foodAllowanceMonthly: c.alimentacaoMensal,
      perDiemMonthly: c.ajudasMensal,
      benefitsAnnual: c.beneficiosAnual,
    },
  };
}

/**
 * Aggregate monthly cost across a list of currently-effective snapshots.
 * Caller is responsible for filtering by `is_effective` and current
 * `effective_from`/`effective_to` window.
 */
export function totalMonthlyCompanyCost(snapshots: Snapshot[]): number {
  return snapshots.reduce((sum, s) => {
    const cost = computeMonthlyCompanyCost(s);
    return sum + (cost?.monthlyAverage ?? 0);
  }, 0);
}
