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
  stage_role?: string | null;
};

function roleOf(stage: QuoteStage): string {
  return ((stage as StageLike).stage_role ?? "architecture") as string;
}

function isSupplierRole(stage: QuoteStage): boolean {
  const role = roleOf(stage);
  return role === "supplier_group" || role === "supplier_phase";
}

export function getChildren(stageId: string, stages: QuoteStage[]): QuoteStage[] {
  return stages.filter((s) => (s as StageLike).parent_stage_id === stageId);
}

export function isParentStage(stageId: string, stages: QuoteStage[]): boolean {
  return getChildren(stageId, stages).length > 0;
}

function childrenBillIndependently(stage: QuoteStage): boolean {
  return Boolean((stage as StageLike & { children_bill_independently?: boolean }).children_bill_independently);
}

/**
 * Stages that should appear in the payment schedule.
 *
 * Default: each top-level stage (no parent in list) generates one billing
 * entry; its children are absorbed into the parent's rollup.
 *
 * If a parent has `children_bill_independently = true`, that parent is
 * replaced in the schedule by its direct children (recursively), so each
 * child becomes its own billing entry.
 */
export function topLevelBillableStages(stages: QuoteStage[]): QuoteStage[] {
  const ids = new Set(stages.map((s) => s.id));
  const roots = stages.filter((s) => {
    const p = (s as StageLike).parent_stage_id;
    return !p || !ids.has(p);
  });
  // A subtree must be "expanded" (parent absorbed; descendants billed
  // independently) if the parent itself is flagged OR any descendant is
  // flagged. Without this, a root that isn't flagged collapses the whole
  // project even when sub-parents (e.g. Design, Construction) are flagged.
  const subtreeHasFlag = (s: QuoteStage): boolean => {
    if (childrenBillIndependently(s)) return true;
    return getChildren(s.id, stages).some(subtreeHasFlag);
  };
  const out: QuoteStage[] = [];
  const visit = (s: QuoteStage) => {
    const kids = getChildren(s.id, stages);
    if (kids.length > 0 && (childrenBillIndependently(s) || kids.some(subtreeHasFlag))) {
      for (const k of kids) visit(k);
    } else {
      out.push(s);
    }
  };
  for (const r of roots) visit(r);
  return out;
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
  const childSum = children.reduce(
    (sum, c) => sum + effectiveBillingAmount(c, stages, stageFees),
    0,
  );

  if (mode === "fixed") {
    // A fixed architecture row often represents our own fee while its child
    // supplier rows represent extra contract value. Keep the fixed own fee,
    // but still add supplier subtrees so the contract total is architecture +
    // engineering/suppliers. Supplier parents remain fixed totals to avoid
    // parent+child double counting inside a supplier subtree.
    if (isSupplierRole(stage)) return ownBudget;
    const supplierChildren = children.reduce(
      (sum, c) => sum + (isSupplierRole(c) ? effectiveBillingAmount(c, stages, stageFees) : 0),
      0,
    );
    return ownBudget + supplierChildren;
  }

  // Calculated parent bars normally equal the sum of descendants. If the
  // architecture parent also carries its own budget and has supplier children,
  // treat that own budget as the architecture fee and add the suppliers.
  const hasSupplierChildren = children.some(isSupplierRole);
  const ownArchitectureFee = !isSupplierRole(stage) && hasSupplierChildren ? ownBudget : 0;
  return childSum + ownArchitectureFee;
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
