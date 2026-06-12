/**
 * Outline column for the Gantt chart — Merlin-style left tree.
 *
 * Renders a sticky-left column with WBS numbering, collapsible parents,
 * indentation guides, and per-row name/dates. Row heights are computed
 * to match exactly what gantt-chart.tsx renders for each stage so the
 * outline stays in sync vertically when the user scrolls.
 *
 * Inline editing
 * - Double-click the stage name to rename (Enter to save, Esc to cancel).
 * - Click the trailing WBS digit to renumber within the same parent;
 *   the host re-sequences siblings via onReorderStage.
 */
import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Briefcase, Box, Wrench } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  /** Optional row selection — when set, clicking a row name selects it. */
  selectedStageId?: string | null;
  onSelectStage?: (id: string) => void;
  /** Inline rename. Resolve to commit; reject to revert. */
  onRenameStage?: (id: string, name: string) => Promise<unknown> | unknown;
  /** Reorder within the current parent: 1-based position among siblings. */
  onReorderStage?: (id: string, newPosition: number) => Promise<unknown> | unknown;
  /** Insert a stage relative to an anchor row (above/below/child/milestone). */
  onInsertStage?: (
    anchorId: string,
    where: "above" | "below" | "child" | "milestone",
  ) => Promise<unknown> | unknown;
  /** Delete a stage by id. */
  onDeleteStage?: (id: string) => Promise<unknown> | unknown;
  /** Per-stage collapse of resource sub-rows. */
  resourcesCollapsed?: Set<string>;
  onToggleResourcesCollapse?: (id: string) => void;
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
  selectedStageId,
  onSelectStage,
  onRenameStage,
  onReorderStage,
  onInsertStage,
  onDeleteStage,
  resourcesCollapsed,
  onToggleResourcesCollapse,
}: Props) {
  return (
    <div
      className="sticky left-0 z-30 shrink-0 border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ width, minWidth: width }}
    >
      <div
        className="sticky top-0 z-10 flex items-end border-b border-border bg-background/95 px-3 pb-1.5"
        style={{ height: headerHeight }}
      >
        <div className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>WBS · Stage</span>
          <span>Dates</span>
        </div>
      </div>

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
          const isSelected = selectedStageId === stage.id;
          const rowContent = (
            <div
              key={stage.id}
              style={{ height: rowH, marginTop: i === 0 ? 0 : rowGap }}
              className={`relative flex items-start ${
                isSelected ? "bg-primary/10" : onSelectStage ? "hover:bg-muted/40 cursor-pointer" : ""
              }`}
              onClick={onSelectStage ? () => onSelectStage(stage.id) : undefined}
            >
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
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleCollapse(stage.id); }}
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

                <WbsCode
                  wbs={wbs}
                  editable={!!onReorderStage}
                  onCommit={(newLast) =>
                    onReorderStage ? onReorderStage(stage.id, newLast) : undefined
                  }
                />

                <Icon
                  className={`mt-0.5 h-3 w-3 shrink-0 ${
                    role === "architecture"
                      ? "text-primary"
                      : role === "supplier_group"
                        ? "text-accent-foreground"
                        : "text-muted-foreground"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <EditableName
                    value={stage.name}
                    summary={isSummary}
                    onSave={onRenameStage ? (next) => onRenameStage(stage.id, next) : undefined}
                  />
                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {fmt(stage.start_date)} → {fmt(stage.end_date)}
                  </div>
                </div>
              </div>
            </div>
          );

          if (!onInsertStage && !onDeleteStage) return rowContent;
          const canChild = role !== "supplier_phase";
          return (
            <ContextMenu key={stage.id}>
              <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                {onInsertStage && (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>Insert</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-44">
                      <ContextMenuItem onSelect={() => onInsertStage(stage.id, "above")}>
                        Stage above
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => onInsertStage(stage.id, "below")}>
                        Stage below
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={!canChild}
                        onSelect={() => canChild && onInsertStage(stage.id, "child")}
                      >
                        Child stage
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => onInsertStage(stage.id, "milestone")}>
                        Milestone
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                )}
                {onDeleteStage && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDeleteStage(stage.id)}
                    >
                      Delete stage
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}

function EditableName({
  value,
  summary,
  onSave,
}: {
  value: string;
  summary: boolean;
  onSave?: (next: string) => Promise<unknown> | unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = async () => {
    const next = draft.trim();
    if (!onSave || !next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    try {
      setBusy(true);
      await onSave(next);
      setEditing(false);
    } catch {
      setDraft(value);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        disabled={busy}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`w-full rounded-sm border border-primary/60 bg-background px-1 text-xs outline-none ${
          summary ? "font-semibold" : "font-medium"
        }`}
      />
    );
  }

  return (
    <div
      className={`truncate text-xs ${summary ? "font-semibold" : "font-medium"} ${
        onSave ? "cursor-text hover:bg-muted/60 rounded-sm px-0.5 -mx-0.5" : ""
      }`}
      title={onSave ? "Double-click to rename" : value}
      onDoubleClick={(e) => {
        if (!onSave) return;
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </div>
  );
}

function WbsCode({
  wbs,
  editable,
  onCommit,
}: {
  wbs: string;
  editable: boolean;
  onCommit: (newLast: number) => Promise<unknown> | unknown;
}) {
  const parts = wbs.split(".");
  const lead = parts.slice(0, -1).join(".");
  const last = parts[parts.length - 1] ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(last);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(last);
  }, [last, editing]);

  const commit = async () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1 || String(n) === last) {
      setDraft(last);
      setEditing(false);
      return;
    }
    try {
      setBusy(true);
      await onCommit(n);
      setEditing(false);
    } catch {
      setDraft(last);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <span className="mt-0.5 inline-flex shrink-0 items-center font-mono text-[10px] tabular-nums text-muted-foreground">
        {lead && <span>{lead}.</span>}
        <input
          ref={inputRef}
          autoFocus
          disabled={busy}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              setDraft(last);
              setEditing(false);
            }
          }}
          className="w-8 rounded-sm border border-primary/60 bg-background px-0.5 text-center text-[10px] outline-none"
        />
      </span>
    );
  }

  return (
    <span
      className={`mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground ${
        editable ? "cursor-pointer hover:text-foreground hover:underline underline-offset-2" : ""
      }`}
      title={editable ? "Click to renumber within siblings" : undefined}
      onClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        setDraft(last);
        setEditing(true);
      }}
    >
      {wbs}
    </span>
  );
}
