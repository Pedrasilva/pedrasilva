/**
 * Pure rules for the CRM opportunities board / list.
 * - One opportunity = one card, in the column of its own stage (never mirrored).
 * - All Won opportunities leave the board (unconverted ones live in Active projects).
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
  return showClosed ? opps : opps.filter((o) => o.stage !== "won" && !isClosedOpportunity(o, convertedIds));
}

export function boardColumns<T extends BoardOpp>(
  stages: ReadonlyArray<string>, opps: T[], convertedIds: ReadonlySet<string>, showClosed: boolean,
) {
  const shown = visibleOpportunities(opps, convertedIds, showClosed);
  return stages
    .filter((s) => s !== "won" && (showClosed || s !== "lost"))
    .map((stage) => {
      const items = shown.filter((o) => o.stage === stage);
      return { stage, items, total: items.reduce((s, o) => s + resolveOpportunityValueWithSource(o).value, 0) };
    });
}

export function shownTotal(opps: BoardOpp[]): number {
  return opps.reduce((s, o) => s + resolveOpportunityValueWithSource(o).value, 0);
}

/** Overview measures wins once per opportunity, independently of project links. */
export function opportunityOverview<T extends BoardOpp & { probability: number }>(opps: T[]) {
  const unique = [...new Map(opps.map(o => [o.id, o])).values()];
  const open = unique.filter(o => o.stage !== "won" && o.stage !== "lost");
  const won = unique.filter(o => o.stage === "won");
  return { unique, open, wonCount: won.length, wonValue: shownTotal(won), totalOpen: shownTotal(open),
    weightedPipeline: open.reduce((sum, o) => sum + resolveOpportunityValueWithSource(o).value * Number(o.probability) / 100, 0) };
}
