/**
 * Outline column for the Gantt chart — spreadsheet-style WBS table.
 *
 * Columns: # · Milestones & Tasks · Dur · Start · Due · Budget · Dep
 *
 * Inline editing
 * - Double-click the name to rename (Enter to save, Esc to cancel).
 * - Click the WBS digit to renumber within siblings.
 * - Click the Dur cell to edit duration; commit shifts the end date
 *   keeping start fixed and the host's update handler triggers the
 *   adapter's FS cascade so successors slide automatically.
 * - Click Start / Due to edit dates directly (also cascades).
 * - Click Budget on a leaf to edit (parents show rollup, read-only).
 *
 * A trailing "+ Insert stage" row at the bottom calls onInsertStage with
 * the last visible row as the anchor; when the tree is empty it calls
 * onAppendRoot (if provided).
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, Briefcase, Box, Wrench, Plus } from "lucide-react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
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
import type { StageWithProject } from "@/components/projects/gantt-chart";

export interface GanttHierarchyNode {
  depth: number;
  wbs: string;
  hasChildren: boolean;
  isSummary: boolean;
  role: "architecture" | "supplier_group" | "supplier_phase";
  parentId: string | null;
}

export interface StageBoundsUpdate {
  id: string;
  projectId: string;
  start_date: string;
  end_date: string;
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
  selectedStageId?: string | null;
  onSelectStage?: (id: string) => void;
  onRenameStage?: (id: string, name: string) => Promise<unknown> | unknown;
  onReorderStage?: (id: string, newPosition: number) => Promise<unknown> | unknown;
  onInsertStage?: (
    anchorId: string,
    where: "above" | "below" | "child" | "milestone",
  ) => Promise<unknown> | unknown;
  onDeleteStage?: (id: string) => Promise<unknown> | unknown;
  resourcesCollapsed?: Set<string>;
  onToggleResourcesCollapse?: (id: string) => void;
  /** Cascading bounds editor: when provided, Dur/Start/Due cells are editable. */
  onUpdateStageBounds?: (args: StageBoundsUpdate) => Promise<unknown> | unknown;
  /** Budget editor for leaves. Parents always render rollup, non-editable. */
  onUpdateStageBudget?: (id: string, projectId: string, budget: number) => Promise<unknown> | unknown;
  /** Optional dependency label map per stage id (e.g. "2FS", "3FS+2d"). */
  dependencyLabels?: Map<string, string>;
  /** Append a brand-new root stage when the trailing "+" row is clicked
   *  and the tree is empty — otherwise we use onInsertStage(lastId,"below"). */
  onAppendRoot?: () => Promise<unknown> | unknown;
}

const ICON_BY_ROLE = {
  architecture: Briefcase,
  supplier_group: Box,
  supplier_phase: Wrench,
} as const;

// Column widths — tuned to match the reference screenshot.
const COL = {
  num: 32,
  dur: 44,
  start: 78,
  due: 78,
  budget: 84,
  dep: 56,
} as const;

const EUR0 = new Intl.NumberFormat("en-EU", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function safeParse(d?: string | null): Date | null {
  if (!d) return null;
  try {
    return parseISO(d);
  } catch {
    return null;
  }
}

function durDays(start?: string | null, end?: string | null): number {
  const a = safeParse(start);
  const b = safeParse(end);
  if (!a || !b) return 0;
  return differenceInCalendarDays(b, a) + 1;
}

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
  onUpdateStageBounds,
  onUpdateStageBudget,
  dependencyLabels,
  onAppendRoot,
}: Props) {
  const last = visibleStages[visibleStages.length - 1];
  const showInsertRow = !!(onInsertStage || onAppendRoot);

  // Total inner width = name flex + fixed columns. Outer width = `width`.
  const fixedTotal = COL.num + COL.dur + COL.start + COL.due + COL.budget + COL.dep;
  const nameWidth = Math.max(140, width - fixedTotal - 16); // 16 = horiz padding

  return (
    <div
      className="sticky left-0 z-30 shrink-0 border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ width, minWidth: width }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-end border-b border-border bg-background/95"
        style={{ height: headerHeight }}
      >
        <div
          className="flex w-full items-center gap-1 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <span style={{ width: COL.num }} className="text-center">#</span>
          <span style={{ width: nameWidth }} className="truncate">Milestones &amp; Tasks</span>
          <span style={{ width: COL.dur }} className="text-right tabular-nums">Dur.</span>
          <span style={{ width: COL.start }} className="text-right">Start</span>
          <span style={{ width: COL.due }} className="text-right">Due</span>
          <span style={{ width: COL.budget }} className="text-right">Budget</span>
          <span style={{ width: COL.dep }} className="text-right">Dep.</span>
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
          const allocs = stage.allocations ?? [];
          const hasResources = allocs.length > 0;
          const resCollapsed = resourcesCollapsed?.has(stage.id) ?? false;
          const chevronMode: "stages" | "resources" | "none" = hasChildren
            ? "stages"
            : hasResources && onToggleResourcesCollapse
              ? "resources"
              : "none";
          const chevronOpen =
            chevronMode === "stages" ? !isCollapsed : !resCollapsed;
          const onChevron = () => {
            if (chevronMode === "stages") onToggleCollapse(stage.id);
            else if (chevronMode === "resources") onToggleResourcesCollapse?.(stage.id);
          };
          const zebra = i % 2 === 1 ? "bg-muted/20" : "";
          const dur = durDays(stage.start_date, stage.end_date);
          const dep = dependencyLabels?.get(stage.id);
          const editable = !!onUpdateStageBounds;
          const projectId = (stage as { projectId: string }).projectId;

          const commitBounds = async (next: { start_date: string; end_date: string }) => {
            if (!onUpdateStageBounds) return;
            await onUpdateStageBounds({
              id: stage.id,
              projectId,
              start_date: next.start_date,
              end_date: next.end_date,
            });
          };

          const rowContent = (
            <div
              key={stage.id}
              style={{ height: rowH, marginTop: i === 0 ? 0 : rowGap }}
              className={`relative flex items-stretch border-b border-border/60 ${
                isSelected
                  ? "bg-primary/10"
                  : `${zebra} ${onSelectStage ? "hover:bg-muted/40 cursor-pointer" : ""}`
              }`}
              onClick={onSelectStage ? () => onSelectStage(stage.id) : undefined}
            >
              {/* indentation guides */}
              {Array.from({ length: depth + 1 }).map((_, d) => (
                <div
                  key={d}
                  className={`absolute top-0 h-full ${
                    d < depth ? "border-l border-dashed border-border/60" : "border-l border-border/40"
                  }`}
                  style={{ left: 12 + d * 12 }}
                />
              ))}

              <div className="flex w-full items-start gap-1 px-2 pt-2">
                {/* # column = editable WBS */}
                <div style={{ width: COL.num }} className="shrink-0 text-center">
                  <WbsCode
                    wbs={wbs}
                    editable={!!onReorderStage}
                    onCommit={(n) => (onReorderStage ? onReorderStage(stage.id, n) : undefined)}
                  />
                </div>

                {/* Name column */}
                <div
                  style={{ width: nameWidth, paddingLeft: depth * 12 }}
                  className="flex min-w-0 items-start gap-1"
                >
                  {chevronMode !== "none" ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onChevron(); }}
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted"
                      aria-label={chevronOpen ? "Collapse" : "Expand"}
                    >
                      {chevronOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                  ) : (
                    <div className="h-4 w-4 shrink-0" />
                  )}
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
                  </div>
                </div>

                {/* Dur. */}
                <div style={{ width: COL.dur }} className="shrink-0 text-right">
                  <NumberCell
                    value={dur}
                    align="right"
                    editable={editable && !isSummary}
                    suffix=""
                    onCommit={async (n) => {
                      if (!stage.start_date) return;
                      const start = parseISO(stage.start_date);
                      const end = addDays(start, Math.max(0, n - 1));
                      await commitBounds({
                        start_date: stage.start_date,
                        end_date: format(end, "yyyy-MM-dd"),
                      });
                    }}
                  />
                </div>

                {/* Start */}
                <div style={{ width: COL.start }} className="shrink-0 text-right">
                  <DateCell
                    value={stage.start_date}
                    editable={editable && !isSummary}
                    onCommit={async (next) => {
                      const a = parseISO(next);
                      const end = addDays(a, Math.max(0, dur - 1));
                      await commitBounds({
                        start_date: next,
                        end_date: format(end, "yyyy-MM-dd"),
                      });
                    }}
                  />
                </div>

                {/* Due */}
                <div style={{ width: COL.due }} className="shrink-0 text-right">
                  <DateCell
                    value={stage.end_date}
                    editable={editable && !isSummary}
                    onCommit={async (next) => {
                      await commitBounds({
                        start_date: stage.start_date,
                        end_date: next,
                      });
                    }}
                  />
                </div>

                {/* Budget */}
                <div style={{ width: COL.budget }} className="shrink-0 text-right">
                  <BudgetCell
                    value={Number(stage.budget ?? 0)}
                    summary={isSummary || hasChildren}
                    editable={!!onUpdateStageBudget && !isSummary && !hasChildren}
                    onCommit={async (n) => {
                      await onUpdateStageBudget?.(stage.id, projectId, n);
                    }}
                  />
                </div>

                {/* Dep */}
                <div style={{ width: COL.dep }} className="shrink-0 pr-1 text-right text-[10px] tabular-nums text-muted-foreground">
                  {dep ?? "—"}
                </div>
              </div>

              {/* Resource sub-list (unchanged behaviour) */}
              {chevronMode === "resources" && !resCollapsed && (
                <ul
                  className="absolute left-0 right-0 mt-7 space-y-1 pr-3"
                  style={{ paddingLeft: COL.num + 16 + depth * 12 + 24, top: 0 }}
                >
                  {allocs.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: a.resource?.color ?? "#a78bfa" }}
                      />
                      <span className="flex-1 truncate italic">{a.resource?.name ?? "—"}</span>
                      {a.allocation_percentage != null && (
                        <span className="tabular-nums">{a.allocation_percentage}%</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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

        {/* Trailing "+ Insert stage" row */}
        {showInsertRow && (
          <button
            type="button"
            onClick={() => {
              if (last && onInsertStage) onInsertStage(last.id, "below");
              else if (onAppendRoot) void onAppendRoot();
            }}
            className="mt-2 flex w-full items-center gap-1.5 border-b border-dashed border-border/60 px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            <span>Insert stage</span>
          </button>
        )}
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
          if (e.key === "Enter") { e.preventDefault(); void commit(); }
          else if (e.key === "Escape") { setDraft(value); setEditing(false); }
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

  useEffect(() => { if (!editing) setDraft(last); }, [last, editing]);

  const commit = async () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1 || String(n) === last) {
      setDraft(last); setEditing(false); return;
    }
    try { setBusy(true); await onCommit(n); setEditing(false); }
    catch { setDraft(last); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center font-mono text-[10px] tabular-nums text-muted-foreground">
        {lead && <span>{lead}.</span>}
        <input
          autoFocus
          disabled={busy}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); void commit(); }
            else if (e.key === "Escape") { setDraft(last); setEditing(false); }
          }}
          className="w-8 rounded-sm border border-primary/60 bg-background px-0.5 text-center text-[10px] outline-none"
        />
      </span>
    );
  }

  return (
    <span
      className={`font-mono text-[10px] tabular-nums text-muted-foreground ${
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

function NumberCell({
  value,
  editable,
  align,
  suffix,
  onCommit,
}: {
  value: number;
  editable: boolean;
  align: "left" | "right";
  suffix?: string;
  onCommit: (n: number) => Promise<unknown> | unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  const commit = async () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n === value) { setDraft(String(value)); setEditing(false); return; }
    try { setBusy(true); await onCommit(n); setEditing(false); }
    catch { setDraft(String(value)); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <input
        autoFocus
        disabled={busy}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.\-]/g, ""))}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); void commit(); }
          else if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        className={`w-full rounded-sm border border-primary/60 bg-background px-1 text-[11px] tabular-nums outline-none text-${align}`}
      />
    );
  }
  return (
    <span
      className={`block tabular-nums text-[11px] text-${align} ${editable ? "cursor-pointer hover:bg-muted/60 rounded-sm px-0.5" : "text-muted-foreground"}`}
      onClick={(e) => { if (!editable) return; e.stopPropagation(); setEditing(true); }}
      title={editable ? "Click to edit" : undefined}
    >
      {value}{suffix}
    </span>
  );
}

function DateCell({
  value,
  editable,
  onCommit,
}: {
  value: string;
  editable: boolean;
  onCommit: (iso: string) => Promise<unknown> | unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);

  const commit = async () => {
    if (!draft || draft === value) { setDraft(value ?? ""); setEditing(false); return; }
    try { setBusy(true); await onCommit(draft); setEditing(false); }
    catch { setDraft(value ?? ""); }
    finally { setBusy(false); }
  };

  const display = useMemo(() => {
    const d = safeParse(value);
    return d ? format(d, "dd/MM/yyyy") : "—";
  }, [value]);

  if (editing) {
    return (
      <input
        autoFocus
        disabled={busy}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); void commit(); }
          else if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
        }}
        className="w-full rounded-sm border border-primary/60 bg-background px-1 text-[10px] tabular-nums outline-none"
      />
    );
  }
  return (
    <span
      className={`block text-[10px] tabular-nums ${editable ? "cursor-pointer text-foreground hover:bg-muted/60 rounded-sm px-0.5" : "text-muted-foreground"}`}
      onClick={(e) => { if (!editable) return; e.stopPropagation(); setEditing(true); }}
      title={editable ? "Click to edit" : undefined}
    >
      {display}
    </span>
  );
}

function BudgetCell({
  value,
  summary,
  editable,
  onCommit,
}: {
  value: number;
  summary: boolean;
  editable: boolean;
  onCommit: (n: number) => Promise<unknown> | unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || 0));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value || 0)); }, [value, editing]);

  const commit = async () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n === value) { setDraft(String(value)); setEditing(false); return; }
    try { setBusy(true); await onCommit(n); setEditing(false); }
    catch { setDraft(String(value)); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <input
        autoFocus
        disabled={busy}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); void commit(); }
          else if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        className="w-full rounded-sm border border-primary/60 bg-background px-1 text-right text-[11px] tabular-nums outline-none"
      />
    );
  }
  return (
    <span
      className={`block text-right tabular-nums text-[11px] ${
        summary ? "font-semibold text-foreground" : editable ? "text-foreground" : "text-muted-foreground"
      } ${editable ? "cursor-pointer hover:bg-muted/60 rounded-sm px-0.5" : ""}`}
      onClick={(e) => { if (!editable) return; e.stopPropagation(); setEditing(true); }}
      title={editable ? "Click to edit" : "Rollup of children"}
    >
      {value > 0 ? EUR0.format(value) : "—"}
    </span>
  );
}
