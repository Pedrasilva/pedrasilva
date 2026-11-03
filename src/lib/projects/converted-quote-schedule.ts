import type { StageWithAllocations } from "./types";

export function proposalUsesRelativeDates(projectId: string | null, relativeRow: boolean, placeholderDates: boolean) {
  return !projectId && (relativeRow || placeholderDates);
}

/** Resolve by source IDs only. Never infer a link from names, dates or resources. */
export function convertedQuoteSchedule(
  projectId: string,
  quoteStages: Array<{ id: string; name: string; parent_stage_id?: string | null; sort_order: number }>,
  quoteAllocations: Array<{ id: string; stage_id: string }>,
  liveStages: StageWithAllocations[],
) {
  const issues: string[] = [];
  const stageMap = new Map<string, StageWithAllocations>();
  for (const quote of quoteStages) {
    const matches = liveStages.filter(s => s.project_id === projectId && s.source_quote_stage_id === quote.id);
    if (matches.length !== 1) issues.push(quote.name);
    else stageMap.set(quote.id, matches[0]);
  }
  const allocationIds = new Set(quoteAllocations.map(a => a.id));
  for (const quote of quoteAllocations) {
    const stage = stageMap.get(quote.stage_id);
    const matches = liveStages.flatMap(s => s.allocations.map(a => ({ stage: s, allocation: a })))
      .filter(x => x.allocation.source_quote_allocation_id === quote.id);
    // Monthly retainer conversion legitimately repeats one quote assignment in each live month.
    const valid = stage && matches.length > 0 && matches.every(x =>
      x.stage.project_id === projectId && x.allocation.stage_id === x.stage.id &&
      (x.stage.id === stage.id || (stage.stage_kind === "retainer_monthly" && x.stage.parent_stage_id === stage.id))) &&
      new Set(matches.map(x => x.stage.id)).size === matches.length;
    if (!valid) issues.push(stage?.name ?? quote.stage_id);
  }
  for (const stage of liveStages) for (const a of stage.allocations) {
    if (a.source_quote_allocation_id && !allocationIds.has(a.source_quote_allocation_id)) issues.push(stage.name);
  }
  const lastOrder = Math.max(0, ...quoteStages.map(s => s.sort_order));
  const stages = liveStages.map(live => {
    const quote = quoteStages.find(s => stageMap.get(s.id)?.id === live.id);
    if (!quote) return live;
    return {
      ...live,
      // Presentation-only quote WBS; all identifiers and dates remain operational.
      parent_stage_id: quote.parent_stage_id ? stageMap.get(quote.parent_stage_id)?.id ?? live.parent_stage_id : null,
      sort_order: live.stage_kind === "retainer_monthly" ? lastOrder + 1 : quote.sort_order,
    };
  });
  return { stages, issues: [...new Set(issues)] };
}