/**
 * Architectural fee calculator — percentage of construction value.
 *
 * Pure functions reproducing the algorithm from the company's reference
 * Excel sheet "P0000_Fee_calculator". Used by Project Proposals only.
 *
 * FUTURE — blended-rate path: once commercial role rates exist, a parallel
 * resolver will compute fees from a role mix (see
 * `src/lib/proposal-roles` + `resolvePhaseStaffingMix` in
 * `src/lib/proposal-rendering`) instead of construction value. That path is
 * NOT yet implemented; the % of construction algorithm below remains the
 * only fee model in use.
 *
 * Algorithm (Architecture only):
 *   construction_value     = area × cost_per_m²            (or entered directly)
 *   structure_value        = construction_value × 16%
 *   foundation_deduction   = structure_value × 5%          (= construction_value × 0.8%)
 *   uplift_value           = construction_value × uplift_pct    (heritage 30% / extension 20%)
 *   adjusted_value         = construction_value − foundation_deduction + uplift_value
 *   fee_pct                = categoryCurve(adjusted_value, category)
 *   gross_fee              = adjusted_value × fee_pct / 100
 *   final_fee              = gross_fee × (1 − discount_pct)
 *
 * Category curve (from Excel cells G22/H22, applied at the F=5,985,574.76 €
 * crossover):
 *   if F ≤ THRESHOLD:
 *     cat 2: 11.16841 − 1.96841·log10(F/59.85) + 7.80462/log10(F/59.85)
 *            + 0.000008 · F/59.85
 *     cat 3:  8.97879 − 1.49598·log10(F/59.85) + 13.44813/log10(F/59.85)
 *            + 0.000005 · F/59.85
 *   else:
 *     cat 2: 1.21 + 2.5·√(THRESHOLD/F)
 *     cat 3: 1.5 + 3.2·√(THRESHOLD/F)
 *
 * Constants are kept verbatim from the spreadsheet — do not "tidy up" the
 * decimals, the curve was fit to those exact coefficients.
 */

export const STRUCTURE_PCT = 0.16;
export const FOUNDATION_PCT_OF_STRUCTURE = 0.05;
export const FEE_CURVE_THRESHOLD = 5_985_574.76;
export const FEE_CURVE_DIVISOR = 59.85;

export const DEFAULT_HERITAGE_UPLIFT = 0.3;
export const DEFAULT_EXTENSION_UPLIFT = 0.2;

export type FeeCategory = 2 | 3;

/** Default stage % breakdown — sums to 1.0. Editable per quote. */
export const DEFAULT_STAGE_PERCENTAGES: number[] = [0.10, 0.30, 0.20, 0.30, 0.10];

export interface FeeCalculatorStage {
  /** User-entered stage name. Empty by default — proposal builder uses
   *  the actual quote_stages.name once the user sets it there. */
  name: string;
  /** Share of the final fee, 0..1. */
  percentage: number;
}

export interface FeeCalculatorInputs {
  /** € — entered directly OR derived from area × cost_per_m². */
  constructionValue: number | null;
  costPerSqm: number | null;
  area: number | null;
  category: FeeCategory;
  /** 0..1 (e.g. 0.10 = 10%). */
  discount: number;
  /** 0..1 — heritage / refurbishment uplift on construction value. */
  heritageUplift: number;
  /** 0..1 — extension uplift on construction value. */
  extensionUplift: number;
  stages: FeeCalculatorStage[];
}

export interface FeeCalculatorResult {
  constructionValue: number;
  structureValue: number;
  foundationDeduction: number;
  heritageUpliftValue: number;
  extensionUpliftValue: number;
  /** construction_value − foundation_deduction + uplifts. Fee % is computed
   *  on this figure, matching the Excel reference (cell F22). */
  adjustedConstructionValue: number;
  /** Architectural fee % from the category curve, 0..100. */
  feePercentage: number;
  baseFee: number;
  /** Final architecture fee after discount. */
  finalFee: number;
  stageBreakdown: { name: string; percentage: number; amount: number }[];
}

/** Architectural fee % for a value `value` (€) at the given category.
 *  Returns 0 for non-positive values. */
export function categoryFeePercentage(value: number, category: FeeCategory): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value > FEE_CURVE_THRESHOLD) {
    const k1 = category === 2 ? 1.21 : 1.5;
    const k2 = category === 2 ? 2.5 : 3.2;
    return k1 + k2 * Math.sqrt(FEE_CURVE_THRESHOLD / value);
  }
  const x = value / FEE_CURVE_DIVISOR;
  const log = Math.log10(x);
  if (!Number.isFinite(log) || log === 0) return 0;
  if (category === 2) {
    return 11.16841 - 1.96841 * log + 7.80462 / log + 0.000008 * x;
  }
  return 8.97879 - 1.49598 * log + 13.44813 / log + 0.000005 * x;
}

export function defaultFeeCalculatorInputs(): FeeCalculatorInputs {
  return {
    constructionValue: null,
    costPerSqm: null,
    area: null,
    category: 3,
    discount: 0,
    heritageUplift: 0,
    extensionUplift: 0,
    stages: DEFAULT_STAGE_PERCENTAGES.map((p) => ({ name: "", percentage: p })),
  };
}

/** Resolves the construction value, preferring the explicit input and falling
 *  back to area × cost_per_m². */
export function resolveConstructionValue(inputs: FeeCalculatorInputs): number {
  if (inputs.constructionValue && inputs.constructionValue > 0) {
    return inputs.constructionValue;
  }
  const area = inputs.area ?? 0;
  const cost = inputs.costPerSqm ?? 0;
  return area > 0 && cost > 0 ? area * cost : 0;
}

export function computeFeeCalculator(inputs: FeeCalculatorInputs): FeeCalculatorResult {
  const constructionValue = resolveConstructionValue(inputs);
  const structureValue = constructionValue * STRUCTURE_PCT;
  const foundationDeduction = structureValue * FOUNDATION_PCT_OF_STRUCTURE;
  const heritageUpliftValue = constructionValue * (inputs.heritageUplift ?? 0);
  const extensionUpliftValue = constructionValue * (inputs.extensionUplift ?? 0);
  const adjustedConstructionValue =
    constructionValue - foundationDeduction + heritageUpliftValue + extensionUpliftValue;
  const feePercentage = categoryFeePercentage(adjustedConstructionValue, inputs.category);
  const baseFee = adjustedConstructionValue * (feePercentage / 100);
  const discount = Math.min(Math.max(inputs.discount ?? 0, 0), 1);
  const finalFee = baseFee * (1 - discount);
  const stageBreakdown = (inputs.stages ?? []).map((s) => ({
    name: s.name,
    percentage: s.percentage,
    amount: finalFee * (s.percentage ?? 0),
  }));
  return {
    constructionValue,
    structureValue,
    foundationDeduction,
    heritageUpliftValue,
    extensionUpliftValue,
    adjustedConstructionValue,
    feePercentage,
    baseFee,
    finalFee,
    stageBreakdown,
  };
}

/** Tolerant parser for the JSONB column on fee_proposals. Returns defaults
 *  when the value is empty/invalid so the UI never crashes on legacy rows. */
export function parseFeeCalculatorPayload(raw: unknown): FeeCalculatorInputs {
  const base = defaultFeeCalculatorInputs();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const cat = num(r.category);
  const stagesRaw = Array.isArray(r.stages) ? (r.stages as unknown[]) : null;
  const stages: FeeCalculatorStage[] = stagesRaw
    ? stagesRaw.map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return {
          name: typeof o.name === "string" ? o.name : "",
          percentage: num(o.percentage) ?? 0,
        };
      })
    : base.stages;
  return {
    constructionValue: num(r.constructionValue),
    costPerSqm: num(r.costPerSqm),
    area: num(r.area),
    category: cat === 2 ? 2 : 3,
    discount: num(r.discount) ?? 0,
    heritageUplift: num(r.heritageUplift) ?? 0,
    extensionUplift: num(r.extensionUplift) ?? 0,
    stages: stages.length > 0 ? stages : base.stages,
  };
}
