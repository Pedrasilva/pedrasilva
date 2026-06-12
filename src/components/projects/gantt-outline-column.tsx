/**
 * Outline column for the Gantt chart — Merlin-style left tree.
 *
 * Renders a sticky-left column with WBS numbering, collapsible parents,
 * indentation guides, and per-row name/dates. Row heights are computed
 * to match exactly what gantt-chart.tsx renders for each stage so the
 * outline stays in sync vertically when the user scrolls.
 *
 * This component is intentionally read-only: edits happen in the
 * existing inline editors inside the chart.
 */
import { ChevronDown, ChevronRight, Briefcase, Box, Wrench } from "lucide-react";
import { fmt } from "@/lib/projects/gantt-utils";
import type { StageWithProject } from "@/components/projects/gantt-chart";

export interface GanttHierarchyNode {
  /** depth from root (0 = top-level architecture stage) */
  depth: number;
  /** WBS code, e.g. "1", "1.1", "1.1.2" */
  wbs: string;
  /** node has at least one child in the tree */
  hasChildren: boolean;
  /** render as summary/rollup row (no allocations, slim bar) */
  isSummary: boolean;
  /** semantic role for the icon */
  role: "architecture" | "supplier_group" | "supplier_phase";
  /** parent stage id (null at root) */
  parentId: string | null;
}

interface Props {
  visibleStages: StageWithProject[];
  hierarchy: Map<string, GanttHierarchyNode>;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  width: number;
  headerHeight: number;
  rowHeightFor: (stageId: string) => number;
  rowGap: number;
  topPadding: number;
}

const ICON_BY_ROLE = {
  architecture: Briefcase,
  supplier_group: Box,
  supplier_phase: Wrench,
} as const;

export function GanttOutlineColumn({
  visibleStages,
  hierarchy,
  collapsed,
  onToggleCollapse,
  width,
  headerHeight,
  rowHeightFor,
  rowGap,
  topPadding,
}: Props) {
  return (
    <div
      className="sticky left-0 z-30 shrink-0 border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ width, minWidth: width }}
    >
      {/* Header — matches the months+days/weeks/quarters band */}
      <div
        className="sticky top-0 z-10 flex items-end border-b border-border bg-background/95 px-3 pb-1.5"
        style={{ height: headerHeight }}
      >
        <div className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>WBS · Stage</span>
          <span>Dates</span>
        </div>
      </div>

      {/* Rows — first item has topPadding spacer to mirror the chart's py-4 */}
      <div style={{ paddingTop: topPadding }}>
        {visibleStages.map((stage, i) => {
          const node = hierarchy.get(stage.id);
          const depth = node?.depth ?? 0;
          const wbs = node?.wbs ?? String(i + 1);
          const isCollapsed = collapsed.has(stage.id);
          const hasChildren = node?.hasChildren ?? false;
          const isSummary = node?.isSummary ?? false;
          const role = node?.role ?? "architecture";
          const Icon = ICON_BY_ROLE[role];
          const rowH = rowHeightFor(stage.id);
          return (
            <div
              key={stage.id}
              style={{ height: rowH, marginTop: i === 0 ? 0 : rowGap }}
              className="relative flex items-start"
            >
              {/* indent guides */}
              {Array.from({ length: depth }).map((_, d) => (
                <div
                  key={d}
                  className="absolute top-0 h-full border-l border-dashed border-border/50"
                  style={{ left: 12 + d * 16 }}
                />
              ))}

              <div
                className="flex w-full items-start gap-1.5 pt-2 pr-3"
                style={{ paddingLeft: 8 + depth * 16 }}
              >
                {/* Chevron / spacer */}
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => onToggleCollapse(stage.id)}
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted"
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}

                {/* WBS code */}
                <span className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {wbs}
                </span>

                {/* Role icon */}
                <Icon
                  className={`mt-0.5 h-3 w-3 shrink-0 ${
                    role === "architecture"
                      ? "text-primary"
                      : role === "supplier_group"
                        ? "text-accent-foreground"
                        : "text-muted-foreground"
                  }`}
                />

                {/* Name + dates */}
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-xs ${
                      isSummary ? "font-semibold" : "font-medium"
                    }`}
                    title={stage.name}
                  >
                    {stage.name}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {fmt(stage.start_date)} → {fmt(stage.end_date)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
