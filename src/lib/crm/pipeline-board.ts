/**
 * Pure rules for the CRM opportunities board / list.
 * - One opportunity = one card, in the column of its own stage (never mirrored).
 * - Won opportunities that already became a project leave the pipeline.
 * - Lost and converted opportunities only show with "Show closed".
 * - Totals only count what is shown.
 */
import { resolveOpportunityValueWithSource } from "./opportunity-value";

export type BoardOpp = {
  id: string;
  stage: string;
  estimated_fee: number | string | null;
  quotes?: Array<{ valor: number | string | null; resolved_value?: number | string | null; archived_at?: string | null; deleted_at?: string | null }> | null;
};

/** True when the opportunity is closed (lost, or won and converted to a project). */
export function isClosedOpportunity(o: BoardOpp, convertedIds: ReadonlySet<string>): boolean {
  if (o.stage === "lost") return true;
  return o.stage === "won" && convertedIds.has(o.id);
}

export function visibleOpportunities<T extends BoardOpp>(
  opps: T[], convertedIds: ReadonlySet<string>, showClosed: boolean,
): T[] {
  return showClosed ? opps : opps.filter((o) => !isClosedOpportunity(o, convertedIds));
}

export function boardColumns<T extends BoardOpp>(
  stages: ReadonlyArray<string>, opps: T[], convertedIds: ReadonlySet<string>, showClosed: boolean,
) {
  const shown = visibleOpportunities(opps, convertedIds, showClosed);
  return stages
    .filter((s) => showClosed || s !== "lost")
    .map((stage) => {
      const items = shown.filter((o) => o.stage === stage);
      return { stage, items, total: items.reduce((s, o) => s + resolveOpportunityValueWithSource(o).value, 0) };
    });
}

export function shownTotal(opps: BoardOpp[]): number {
  return opps.reduce((s, o) => s + resolveOpportunityValueWithSource(o).value, 0);
}
