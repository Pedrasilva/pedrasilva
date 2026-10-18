/**
 * Single source of truth for "what is this opportunity worth".
 *
 * The Overview rollup and the pipeline/list views used to read
 * `estimated_fee` directly, which is 0 for legacy/imported opportunities that
 * only ever carried a value on their quote. Both surfaces now go through this
 * resolver so they can never disagree.
 */

export type OpportunityQuoteValue = {
  valor: number | string | null;
  /** Value derived from the quote's planning data (stage budgets, allocated
   *  resources, external services) when no headline `valor` was typed in.
   *  Comes from the `fee_proposal_values` view. */
  resolved_value?: number | string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
};

/** Best-known value for a single quote: derived planning value, else `valor`. */
export function quoteValue(q: OpportunityQuoteValue): number {
  return Number(q.resolved_value) || Number(q.valor) || 0;
}

/** Sum of the active (non-archived, non-deleted) quotes attached to an opportunity. */
export function activeQuotesTotal(quotes: OpportunityQuoteValue[] | null | undefined): number {
  return (quotes ?? [])
    .filter((q) => !q.archived_at && !q.deleted_at)
    .reduce((sum, q) => sum + quoteValue(q), 0);
}


export type OpportunityValueSource = "quoted" | "estimated";

/**
 * Resolved opportunity value: a positive active quoted total, otherwise the
 * estimated fee. Cards, column, header and Overview totals all use this.
 */
export function resolveOpportunityValueWithSource(
  opp: { estimated_fee: number | string | null } & {
    quotes?: OpportunityQuoteValue[] | null;
  },
): { value: number; source: OpportunityValueSource } {
  const quotedTotal = activeQuotesTotal(opp.quotes);
  if (quotedTotal > 0) return { value: quotedTotal, source: "quoted" };
  return { value: Number(opp.estimated_fee) || 0, source: "estimated" };
}

export function resolveOpportunityValue(
  opp: { estimated_fee: number | string | null } & {
    quotes?: OpportunityQuoteValue[] | null;
  },
): number {
  return resolveOpportunityValueWithSource(opp).value;
}
