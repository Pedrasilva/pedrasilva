type SourceState = { data: unknown; isFetching: boolean; isError: boolean };
/** A resolved empty dataset is valid; an absent/in-flight/failed source is not. */
export function proposalPaginationReady(proposal: SourceState, blocks: SourceState, live: SourceState, needsLive: boolean): boolean {
  const ready = (q: SourceState) => q.data !== undefined && q.data !== null && !q.isFetching && !q.isError;
  return ready(proposal) && ready(blocks) && (!needsLive || ready(live));
}