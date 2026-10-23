/** Pure helpers for the reconciliation match panel (kept separate so they can be tested). */
import type { Suggestion } from "@/lib/finance/reconcile-suggestions";

export type MatchOrigin = "purchase" | "sale" | "project" | "entrada" | "hr" | "transfer";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split payment allocation: documents are paid in the order chosen, each up to its open amount,
 * never beyond what is still open on the movement. The remainder is what stays unmatched.
 */
export function allocateSplit(txOpen: number, docs: Array<{ id: string; outstanding: number }>) {
  let left = r2(txOpen);
  const allocations: Array<{ id: string; amount: number }> = [];
  for (const d of docs) {
    const amount = r2(Math.min(Math.max(0, d.outstanding), left));
    if (amount <= 0) continue;
    allocations.push({ id: d.id, amount });
    left = r2(left - amount);
  }
  const selectedTotal = r2(docs.reduce((s, d) => s + Math.max(0, d.outstanding), 0));
  const total = r2(allocations.reduce((s, a) => s + a.amount, 0));
  return { allocations, total, selectedTotal, remainder: r2(txOpen - selectedTotal) };
}

/** Drops repeated copies of the same Entrada document (same supplier, number and amount); keeps the higher-ranked one. */
export function dedupeSuggestions(rows: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return rows.filter((s) => {
    const k = s.kind === "entrada"
      ? `e|${(s.counterparty ?? "").toLowerCase()}|${s.label}|${Number(s.amount ?? 0).toFixed(2)}`
      : `${s.kind}|${s.ref_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
