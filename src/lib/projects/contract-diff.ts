/**
 * Proposed vs. actual diff — derived comparison between the immutable
 * contract baseline (captured at quote→project conversion) and the live plan
 * + billing data. Pure functions; no data fetching here.
 */
import type {
  ContractBaselineStage,
  ContractBaselinePayment,
} from "@/lib/projects/use-contract-baseline";

export type LiveStage = {
  id: string;
  name: string;
  parent_stage_id: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  sort_order: number;
};

export type LivePaymentItem = {
  id: string;
  label: string;
  stage_id: string | null;
  amount_value: number | null;
  expected_invoice_date: string | null;
  billing_status: string;
};

export type StageDiffStatus =
  | "on_track"
  | "delayed"
  | "budget_changed"
  | "removed"
  | "added";

export type StageDiffRow = {
  key: string;
  baseline: ContractBaselineStage | null;
  live: LiveStage | null;
  status: StageDiffStatus;
  /** live end - baseline end, in days (positive = late). */
  dayDelta: number | null;
  budgetDelta: number | null;
  budgetPct: number | null;
  matchedBy: "id" | "name" | null;
};

export type PaymentDiffStatus =
  | "as_planned"
  | "differs"
  | "not_due"
  | "overdue"
  | "unplanned";

export type PaymentDiffRow = {
  key: string;
  baseline: ContractBaselinePayment | null;
  live: LivePaymentItem | null;
  status: PaymentDiffStatus;
  amountDelta: number | null;
  dayDelta: number | null;
};

/** Tolerances: money in EUR, dates in days. */
export const BUDGET_TOLERANCE = 1;
export const DATE_TOLERANCE_DAYS = 1;

const dayDiff = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return null;
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
};

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function diffStages(
  baseline: ContractBaselineStage[],
  live: LiveStage[],
): StageDiffRow[] {
  const liveById = new Map(live.map((s) => [s.id, s]));
  const liveNameById = new Map(live.map((s) => [s.id, s.name]));
  const usedLive = new Set<string>();
  const rows: StageDiffRow[] = [];

  for (const b of baseline) {
    let match: LiveStage | null = null;
    let matchedBy: "id" | "name" | null = null;

    const linked = (b as ContractBaselineStage & { live_stage_id?: string | null })
      .live_stage_id;
    if (linked && liveById.has(linked) && !usedLive.has(linked)) {
      match = liveById.get(linked)!;
      matchedBy = "id";
    }
    if (!match) {
      match =
        live.find(
          (s) =>
            !usedLive.has(s.id) &&
            norm(s.name) === norm(b.name) &&
            norm(s.parent_stage_id ? liveNameById.get(s.parent_stage_id) : null) ===
              norm(b.parent_name),
        ) ??
        live.find((s) => !usedLive.has(s.id) && norm(s.name) === norm(b.name)) ??
        null;
      if (match) matchedBy = "name";
    }

    if (!match) {
      rows.push({
        key: `b-${b.id}`,
        baseline: b,
        live: null,
        status: "removed",
        dayDelta: null,
        budgetDelta: null,
        budgetPct: null,
        matchedBy: null,
      });
      continue;
    }

    usedLive.add(match.id);
    const dd = dayDiff(match.end_date, b.end_date);
    const bBudget = b.budget ?? 0;
    const lBudget = match.budget ?? 0;
    const budgetDelta = lBudget - bBudget;
    const budgetPct = bBudget !== 0 ? budgetDelta / bBudget : null;

    let status: StageDiffStatus = "on_track";
    if (dd != null && dd > DATE_TOLERANCE_DAYS) status = "delayed";
    else if (Math.abs(budgetDelta) > BUDGET_TOLERANCE) status = "budget_changed";

    rows.push({
      key: `b-${b.id}`,
      baseline: b,
      live: match,
      status,
      dayDelta: dd,
      budgetDelta,
      budgetPct,
      matchedBy,
    });
  }

  for (const s of live) {
    if (usedLive.has(s.id)) continue;
    rows.push({
      key: `l-${s.id}`,
      baseline: null,
      live: s,
      status: "added",
      dayDelta: null,
      budgetDelta: s.budget ?? 0,
      budgetPct: null,
      matchedBy: null,
    });
  }

  return rows;
}

export function diffPayments(
  baseline: ContractBaselinePayment[],
  live: LivePaymentItem[],
  liveStages: LiveStage[],
  today: Date = new Date(),
): PaymentDiffRow[] {
  const stageNameById = new Map(liveStages.map((s) => [s.id, s.name]));
  const used = new Set<string>();
  const rows: PaymentDiffRow[] = [];

  for (const b of baseline) {
    const candidates = live.filter((p) => !used.has(p.id));
    const match =
      candidates.find((p) => norm(p.label) === norm(b.label)) ??
      candidates.find(
        (p) =>
          b.stage_name != null &&
          p.stage_id != null &&
          norm(stageNameById.get(p.stage_id)) === norm(b.stage_name),
      ) ??
      null;

    if (!match) {
      rows.push({
        key: `bp-${b.id}`,
        baseline: b,
        live: null,
        status: "not_due",
        amountDelta: null,
        dayDelta: null,
      });
      continue;
    }
    used.add(match.id);

    const invoiced = match.billing_status === "issued" || match.billing_status === "paid";
    const amountDelta = (match.amount_value ?? 0) - (b.amount ?? 0);
    const dd = dayDiff(match.expected_invoice_date, b.expected_invoice_date);

    let status: PaymentDiffStatus;
    if (invoiced) {
      status =
        Math.abs(amountDelta) > BUDGET_TOLERANCE || (dd != null && Math.abs(dd) > DATE_TOLERANCE_DAYS)
          ? "differs"
          : "as_planned";
    } else {
      const due = b.expected_invoice_date
        ? new Date(b.expected_invoice_date).getTime() < today.getTime()
        : false;
      status = due ? "overdue" : "not_due";
    }

    rows.push({
      key: `bp-${b.id}`,
      baseline: b,
      live: match,
      status,
      amountDelta,
      dayDelta: dd,
    });
  }

  for (const p of live) {
    if (used.has(p.id)) continue;
    if (p.billing_status !== "issued" && p.billing_status !== "paid") continue;
    rows.push({
      key: `lp-${p.id}`,
      baseline: null,
      live: p,
      status: "unplanned",
      amountDelta: p.amount_value ?? 0,
      dayDelta: null,
    });
  }

  return rows;
}
