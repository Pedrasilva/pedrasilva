/**
 * Gantt / WBS numbering for quote stages.
 *
 * Rule (project-wide): whenever stages are referenced in the UI — selects,
 * lists, tables, tokens — they must be displayed with their Gantt number
 * (e.g. "1.2 Detailed Design") AND ordered by that number.
 *
 * The number is derived from `parent_stage_id` + `sort_order`:
 *   top-level stages     → "1", "2", "3", …
 *   children of stage 2  → "2.1", "2.2", …
 *   grandchildren        → "2.1.1", "2.1.2", …
 */

export interface NumberableStage {
  id: string;
  name: string;
  sort_order?: number | null;
  parent_stage_id?: string | null;
}

export interface NumberedStage<T extends NumberableStage> {
  stage: T;
  /** Dotted WBS number, e.g. "2.1". */
  number: string;
  /** Numeric path used for sorting, e.g. [2, 1]. */
  path: number[];
  /** 0-based depth (root = 0). */
  depth: number;
}

/**
 * Build a WBS-ordered list. Roots first, then their children immediately
 * after (depth-first), so consumers can render a flat but hierarchical list.
 */
export function numberStages<T extends NumberableStage>(stages: T[]): NumberedStage<T>[] {
  const byId = new Map<string, T>();
  for (const s of stages) byId.set(s.id, s);

  const childrenByParent = new Map<string | null, T[]>();
  for (const s of stages) {
    // Treat a parent id that doesn't resolve as "root" so orphans still show up.
    const parent = s.parent_stage_id && byId.has(s.parent_stage_id) ? s.parent_stage_id : null;
    const arr = childrenByParent.get(parent) ?? [];
    arr.push(s);
    childrenByParent.set(parent, arr);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const out: NumberedStage<T>[] = [];
  const walk = (parentId: string | null, prefix: number[]) => {
    const kids = childrenByParent.get(parentId) ?? [];
    kids.forEach((stage, idx) => {
      const path = [...prefix, idx + 1];
      out.push({ stage, path, number: path.join("."), depth: path.length - 1 });
      walk(stage.id, path);
    });
  };
  walk(null, []);
  return out;
}

/** Convenience: map of stage id → dotted WBS number. */
export function buildStageNumberMap<T extends NumberableStage>(
  stages: T[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of numberStages(stages)) m.set(n.stage.id, n.number);
  return m;
}

/** Format a stage as "1.2 Name" for menus, labels, etc. */
export function formatStageLabel(stage: NumberableStage, number: string | undefined): string {
  return number ? `${number} ${stage.name}` : stage.name;
}

/**
 * Compare two dotted WBS numbers segment-by-segment numerically.
 * "2" < "2.1" < "2.1.10" < "2.2" < "10".
 * Missing numbers sort last.
 */
export function compareWbsNumbers(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Sort an array of stages by their WBS number (Gantt order).
 * Non-mutating; returns a new array.
 */
export function sortStagesByWbs<T extends NumberableStage>(stages: T[]): T[] {
  const map = buildStageNumberMap(stages);
  return [...stages].sort((a, b) => compareWbsNumbers(map.get(a.id), map.get(b.id)));
}

