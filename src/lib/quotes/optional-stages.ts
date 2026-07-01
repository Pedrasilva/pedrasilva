/**
 * Optional-service helpers.
 *
 * A parent stage flagged with `is_optional = true` (and every descendant)
 * represents an OPTIONAL service — quoted, but excluded from the contract
 * total. The flag is stored only on the parent; descendants inherit it via
 * ancestry walk. These helpers are the single source of truth so display,
 * rollups and generators stay consistent.
 */
import type { QuoteStage } from "./types";

type StageLike = QuoteStage & {
  parent_stage_id?: string | null;
  is_optional?: boolean | null;
};

/** True if `stage` is optional, or any of its ancestors is. */
export function isOptionalStage(
  stage: QuoteStage | null | undefined,
  byId: Map<string, QuoteStage>,
): boolean {
  if (!stage) return false;
  const seen = new Set<string>();
  let cur: StageLike | undefined = stage as StageLike;
  while (cur && !seen.has(cur.id)) {
    if (cur.is_optional === true) return true;
    seen.add(cur.id);
    const pid: string | null = cur.parent_stage_id ?? null;
    cur = pid ? (byId.get(pid) as StageLike | undefined) : undefined;
  }
  return false;
}

/** Build a Map<id, stage> convenience index. */
export function indexStages(stages: QuoteStage[]): Map<string, QuoteStage> {
  return new Map(stages.map((s) => [s.id, s]));
}

/** Return only the stages that are NOT optional (self or via ancestry). */
export function filterOutOptional<T extends QuoteStage>(stages: T[]): T[] {
  const byId = new Map<string, QuoteStage>(stages.map((s) => [s.id, s]));
  return stages.filter((s) => !isOptionalStage(s, byId));
}

/** Return only the stages that ARE optional (self or via ancestry). */
export function keepOnlyOptional<T extends QuoteStage>(stages: T[]): T[] {
  const byId = new Map<string, QuoteStage>(stages.map((s) => [s.id, s]));
  return stages.filter((s) => isOptionalStage(s, byId));
}
