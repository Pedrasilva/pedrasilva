/**
 * Build the outline-column hierarchy + rolled-up summary stages for the
 * project Gantt, mirroring the structure PlannerGantt builds for quotes.
 *
 * - Stages are ordered by tree walk: roots → children, each level sorted by
 *   `sort_order`.
 * - Parent rows render as Merlin-style summary bars whose start/end span
 *   the union of their descendants' dates (the persisted dates on the row
 *   are left untouched in the database — only the rendered span is rolled
 *   up).
 * - A synthetic "Project" row is prepended spanning the full timeline.
 *
 * pm_stages has no `stage_role` column (unlike quote_stages), so every row
 * is treated as the "architecture" role for the outline column.
 */
import type { StageWithAllocations } from "@/lib/projects/types";
import type {
  StageWithProject,
  GanttHierarchyNode,
} from "@/components/projects/gantt-chart";

export const PROJECT_SUMMARY_ID = "__project_summary__";

export function buildProjectGanttTree(
  stages: StageWithAllocations[],
  projectId: string,
  summaryLabel: string,
): { mappedStages: StageWithProject[]; hierarchy: Map<string, GanttHierarchyNode> } {
  // Filter out retainer-monthly rows — those are edited elsewhere.
  const regular = stages.filter((s) => (s as { stage_kind?: string }).stage_kind !== "retainer_monthly");

  const childrenByParent = new Map<string | null, StageWithAllocations[]>();
  for (const s of regular) {
    const pid = (s as { parent_stage_id?: string | null }).parent_stage_id ?? null;
    const arr = childrenByParent.get(pid) ?? [];
    arr.push(s);
    childrenByParent.set(pid, arr);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const ordered: StageWithAllocations[] = [];
  const hier = new Map<string, GanttHierarchyNode>();

  const walk = (node: StageWithAllocations, depth: number, wbs: string, parentId: string | null) => {
    const kids = childrenByParent.get(node.id) ?? [];
    hier.set(node.id, {
      depth,
      wbs,
      hasChildren: kids.length > 0,
      isSummary: kids.length > 0,
      role: "architecture",
      parentId,
    });
    ordered.push(node);
    kids.forEach((c, ci) => walk(c, depth + 1, `${wbs}.${ci + 1}`, node.id));
  };

  const roots = childrenByParent.get(null) ?? [];
  roots.forEach((r, i) => walk(r, 0, String(i + 1), null));

  // Rollup parent dates AND budgets from descendants.
  const rollup = new Map<string, { start: string; end: string; budget: number }>();
  const computeRollup = (node: StageWithAllocations): { start: string; end: string; budget: number } => {
    const kids = childrenByParent.get(node.id) ?? [];
    if (kids.length === 0) {
      return { start: node.start_date, end: node.end_date, budget: Number(node.budget ?? 0) || 0 };
    }
    let minStart = "";
    let maxEnd = "";
    let sumBudget = 0;
    for (const k of kids) {
      const r = computeRollup(k);
      if (!minStart || r.start < minStart) minStart = r.start;
      if (!maxEnd || r.end > maxEnd) maxEnd = r.end;
      sumBudget += r.budget;
    }
    const out = { start: minStart || node.start_date, end: maxEnd || node.end_date, budget: sumBudget };
    rollup.set(node.id, out);
    return out;
  };
  roots.forEach((r) => computeRollup(r));

  const mapped: StageWithProject[] = ordered.map((s) => {
    const ru = rollup.get(s.id);
    return {
      ...s,
      projectId,
      start_date: ru?.start ?? s.start_date,
      end_date: ru?.end ?? s.end_date,
      budget: ru?.budget ?? s.budget,
    } as StageWithProject;
  });

  // Synthetic top-row "Project" summary spanning min(start) → max(end).
  if (mapped.length > 0) {
    let minStart = mapped[0].start_date;
    let maxEnd = mapped[0].end_date;
    for (const s of mapped) {
      if (s.start_date < minStart) minStart = s.start_date;
      if (s.end_date > maxEnd) maxEnd = s.end_date;
    }
    const projectRow = {
      ...mapped[0],
      id: PROJECT_SUMMARY_ID,
      name: summaryLabel,
      start_date: minStart,
      end_date: maxEnd,
      color: "#0f172a",
      budget: roots.reduce((sum, r) => sum + (rollup.get(r.id)?.budget ?? (Number(r.budget ?? 0) || 0)), 0),
      sort_order: -1,
      parent_stage_id: null,
      allocations: [],
      is_milestone: false,
    } as StageWithProject;
    mapped.unshift(projectRow);
    hier.set(PROJECT_SUMMARY_ID, {
      depth: 0,
      wbs: "0",
      hasChildren: false,
      isSummary: true,
      role: "architecture",
      parentId: null,
    });
  }

  return { mappedStages: mapped, hierarchy: hier };
}
