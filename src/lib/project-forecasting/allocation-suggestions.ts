/**
 * Stage 6D — Deterministic allocation suggestion helpers.
 *
 * Pure functions. No DB writes, no auto-assignment. The workspace UI uses
 * these to rank candidate collaborators per stage placeholder; the PM still
 * decides what to do with the ranking.
 *
 * Inputs are existing PM rows + computed Stage 6C capacity envelope.
 */
import type {
  CollaboratorCapacity,
  PlaceholderRow,
  ResourceRow,
  StageRow,
} from "./types";

export interface AllocationSuggestion {
  resource_id: string;
  resource_name: string;
  collaborator_id: string | null;
  discipline_match: boolean;
  current_utilization_pct: number;
  available_hours: number;
  score: number; // higher = better fit
  reason: "match-and-available" | "match-but-loaded" | "available-no-match" | "fallback";
}

export interface SuggestionContext {
  stage: StageRow;
  placeholder?: PlaceholderRow;
  resources: ResourceRow[];
  capacityByResourceId: Map<string, CollaboratorCapacity>;
  /**
   * Optional resolver: maps resource_id → discipline label (lowercased).
   * Disciplines live on the collaborator (HR) layer, not on pm_resources,
   * so callers must pre-resolve.
   */
  disciplineByResourceId?: Map<string, string>;
}

/**
 * Rank collaborators for a given stage placeholder.
 *
 * Scoring (deterministic, transparent):
 *   +60  discipline matches the placeholder discipline
 *   +0..40 from inverse utilization (less loaded = better)
 *   −20  if currently overloaded
 *
 * Ties are broken by resource name (alphabetical) for stability.
 */
export function suggestCollaboratorsForStage(
  ctx: SuggestionContext,
): AllocationSuggestion[] {
  const wantedDiscipline = ctx.placeholder?.discipline?.toLowerCase() ?? null;

  const rows: AllocationSuggestion[] = ctx.resources.map((r) => {
    const cap = ctx.capacityByResourceId.get(r.id);
    const util = cap?.utilization_pct ?? 0;
    const available = Math.max(
      0,
      (cap?.capacity_hours ?? 0) - (cap?.allocated_hours ?? 0),
    );
    const resourceDiscipline =
      ctx.disciplineByResourceId?.get(r.id)?.toLowerCase() ?? null;
    const disciplineMatch =
      !!wantedDiscipline &&
      !!resourceDiscipline &&
      resourceDiscipline === wantedDiscipline;

    const utilizationBonus = Math.max(0, 40 - (util / 100) * 40); // 0..40
    const matchBonus = disciplineMatch ? 60 : 0;
    const overloadPenalty = cap?.overloaded ? 20 : 0;
    const score = +(matchBonus + utilizationBonus - overloadPenalty).toFixed(1);

    const reason: AllocationSuggestion["reason"] = disciplineMatch
      ? cap?.overloaded
        ? "match-but-loaded"
        : "match-and-available"
      : available > 0
        ? "available-no-match"
        : "fallback";

    return {
      resource_id: r.id,
      resource_name: r.name,
      collaborator_id: r.collaborator_id,
      discipline_match: disciplineMatch,
      current_utilization_pct: +util.toFixed(1),
      available_hours: +available.toFixed(1),
      score,
      reason,
    };
  });

  return rows.sort(
    (a, b) =>
      b.score - a.score || a.resource_name.localeCompare(b.resource_name),
  );
}

/** Convenience: top-N for compact UI lists. */
export function topSuggestions(
  ctx: SuggestionContext,
  limit = 5,
): AllocationSuggestion[] {
  return suggestCollaboratorsForStage(ctx).slice(0, limit);
}
