/**
 * Parent-bar billing helpers.
 *
 * A "parent bar" (a.k.a. summary task) is any stage that has at least one
 * child in `quote_stages.parent_stage_id`. Parents are billed as a single
 * unit; their children are excluded from the payment schedule.
 *
 * Each parent picks how its billing amount is derived:
 *   - `budget_mode = 'calculated'` (default): sum of descendant effective
 *     amounts. Leaves contribute their allocation/external-service fee.
 *   - `budget_mode = 'fixed'`: the parent's own `budget` column.
 *
 * For `billing_model = 'stage'`, `stage_billing_timing` selects when:
 *   - 'end' (default): one payment at stage_end
 *   - 'start': one payment at stage_start
 *   - 'split': 50% at stage_start + 50% at stage_end
 */
import type { QuoteStage } from "./types";

type StageLike = QuoteStage & {
  parent_stage_id?: string | null;
  budget_mode?: string | null;
  stage_billing_timing?: string | null;
};

export function getChildren(stageId: string, stages: QuoteStage[]): QuoteStage[] {
  return stages.filter((s) => (s as StageLike).parent_stage_id === stageId);
}

export function isParentStage(stageId: string, stages: QuoteStage[]): boolean {
  return getChildren(stageId, stages).length > 0;
}

/** Stages that should appear in the payment schedule (no parent in list). */
export function topLevelBillableStages(stages: QuoteStage[]): QuoteStage[] {
  const ids = new Set(stages.map((s) => s.id));
  return stages.filter((s) => {
    const p = (s as StageLike).parent_stage_id;
    return !p || !ids.has(p);
  });
}

/**
 * Effective billing amount for a single stage.
 * - Leaf → stageFees[id] (allocations + external services)
 * - Parent + fixed → parent.budget
 * - Parent + calculated → sum of children's effective amounts (recursive)
 */
export function effectiveBillingAmount(
  stage: QuoteStage,
  stages: QuoteStage[],
  stageFees: Record<string, number>,
): number {
  const children = getChildren(stage.id, stages);
  const ownBudget = Number((stage as StageLike).budget ?? 0) || 0;
  const mode = ((stage as StageLike).budget_mode ?? "calculated") as "calculated" | "fixed";
  if (children.length === 0) {
    // Leaf stage: prefer derived fee (allocations + external services). If
    // there are no allocations/externals, fall back to the manually-set
    // stage budget so user-entered phase totals (e.g. fee-only stages like
    // "Developed design") still appear in the schedule.
    const derived = Number(stageFees[stage.id] ?? 0);
    if (mode === "fixed") return ownBudget || derived;
    return derived > 0 ? derived : ownBudget;
  }
  if (mode === "fixed") return ownBudget;
  return children.reduce(
    (sum, c) => sum + effectiveBillingAmount(c, stages, stageFees),
    0,
  );
}

/** Build a fees map keyed only on top-level billable stages, with rolled-up amounts. */
export function rolledUpBillableFees(
  stages: QuoteStage[],
  stageFees: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of topLevelBillableStages(stages)) {
    out[s.id] = Math.round(effectiveBillingAmount(s, stages, stageFees) * 100) / 100;
  }
  return out;
}

export type StageBillingTiming = "end" | "start" | "split";

export function getStageBillingTiming(stage: QuoteStage): StageBillingTiming {
  const t = (stage as StageLike).stage_billing_timing ?? "end";
  return (t === "start" || t === "split") ? t : "end";
}
