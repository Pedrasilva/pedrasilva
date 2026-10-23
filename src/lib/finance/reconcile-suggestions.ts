/**
 * Stage C reconciliation suggestions (browser side).
 *
 * Ranking happens in the database (fin_reconcile_suggestions): top 5 per
 * movement, each with a confidence and the signals behind it. Nothing here
 * ever matches automatically — a person confirms every suggestion.
 */
import { supabase } from "@/integrations/supabase/client";

export type SuggestionReason =
  | { code: "amount_exact" | "amount_fee" | "partial_doc" | "split_tx"; diff?: number }
  | { code: "rule" | "past" | "name" | "reference" | "recurring" }
  | { code: "days"; days: number };

export type Suggestion = {
  kind: "purchase" | "sale" | "entrada";
  ref_id: string;
  label: string;
  counterparty: string | null;
  doc_date: string | null;
  amount: number | null;
  outstanding: number | null;
  confidence: number;
  reasons: SuggestionReason[];
  suggested_amount: number;
  tx_open: number;
};

export const suggestionsKey = (txId: string) => ["finance", "reconcile-suggestions", txId] as const;

export async function fetchSuggestions(txId: string): Promise<Suggestion[]> {
  const { data, error } = await supabase.rpc("fin_reconcile_suggestions", { _tx_id: txId });
  if (error) throw error;
  return ((data ?? []) as unknown as Suggestion[]).map((s) => ({
    ...s,
    outstanding: s.outstanding == null ? null : Number(s.outstanding),
    amount: s.amount == null ? null : Number(s.amount),
    suggested_amount: Number(s.suggested_amount),
    tx_open: Number(s.tx_open),
    reasons: Array.isArray(s.reasons) ? s.reasons : [],
  }));
}

/** Amount of the movement not yet allocated to documents. */
export async function fetchTxOpenBalance(txId: string): Promise<number> {
  const { data, error } = await supabase.rpc("fin_tx_open_balance", { _tx_id: txId });
  if (error) throw error;
  return Number(data ?? 0);
}

export function confidenceTone(c: number): "high" | "medium" | "low" {
  return c >= 75 ? "high" : c >= 50 ? "medium" : "low";
}

type T = (key: string, opts?: Record<string, unknown>) => string;

/** One-line reason, strongest signals first, e.g. "Same amount · Past matches · 50 days". */
export function reasonLine(reasons: SuggestionReason[], t: T, fmtMoney: (n: number) => string): string {
  return reasons
    .map((r) => {
      switch (r.code) {
        case "amount_fee":
          return t("finance:reconSuggest.reason.amount_fee", { diff: fmtMoney(Number(r.diff ?? 0)) });
        case "days":
          return r.days >= 0
            ? t("finance:reconSuggest.reason.days", { count: r.days })
            : t("finance:reconSuggest.reason.daysAfter", { count: -r.days });
        default:
          return t(`finance:reconSuggest.reason.${r.code}`);
      }
    })
    .join(" · ");
}

/** Records "description → supplier/category" after a confirmed match. Never blocks the match. */
export async function learnFromMatch(txId: string, documentId: string): Promise<void> {
  try {
    await supabase.rpc("fin_learn_match_rule", { _tx_id: txId, _doc_id: documentId });
  } catch {
    /* learning is best-effort */
  }
}
