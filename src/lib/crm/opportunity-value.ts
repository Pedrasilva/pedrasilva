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


/**
 * Resolved opportunity value: the declared estimate when it exists, otherwise
 * the total of the quotes actually issued for the deal.
 */
export function resolveOpportunityValue(
  opp: { estimated_fee: number | string | null } & {
    quotes?: OpportunityQuoteValue[] | null;
  },
): number {
  const estimated = Number(opp.estimated_fee) || 0;
  if (estimated > 0) return estimated;
  return activeQuotesTotal(opp.quotes);
}
