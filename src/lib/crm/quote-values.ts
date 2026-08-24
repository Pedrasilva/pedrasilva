/**
 * Quotes only carry a headline `valor` when someone used the fee calculator.
 * Everything built through the planner (stage budgets / allocated resources /
 * external services) leaves `valor` at 0, which is why opportunity cards used
 * to show "0 €" even with quotes attached.
 *
 * `fee_proposal_values` resolves that value in the database, so every CRM
 * surface can read the same number.
 */
import { supabase } from "@/integrations/supabase/client";

export async function fetchResolvedQuoteValues(): Promise<Map<string, number>> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => Promise<{
        data: Array<{ quote_id: string; resolved_value: number | string | null }> | null;
        error: { message: string } | null;
      }>;
    };
  })
    .from("fee_proposal_values")
    .select("quote_id, resolved_value");
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.quote_id, Number(row.resolved_value) || 0);
  }
  return map;
}

/** Attach `resolved_value` onto the nested `quotes` array of each row. */
export function attachResolvedQuoteValues<
  T extends { quotes?: Array<{ id?: string; resolved_value?: number | null }> | null },
>(rows: T[], values: Map<string, number>): T[] {
  return rows.map((row) => ({
    ...row,
    quotes: (row.quotes ?? []).map((q) => ({
      ...q,
      resolved_value: q.id ? (values.get(q.id) ?? null) : null,
    })),
  }));
}
