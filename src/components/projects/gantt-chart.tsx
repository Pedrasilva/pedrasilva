import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, isSameMonth, isWeekend, parseISO, startOfWeek } from "date-fns";
import type { Resource, StageWithAllocations } from "@/lib/projects/types";
import { allocationCost, dayCount, euros, workingDays } from "@/lib/projects/gantt-utils";
import { effectiveCostRate, effectiveSaleRate } from "@/lib/projects/use-default-rates";
import { AllocationEditor } from "@/components/projects/allocation-editor";
import { StageDependencyEditor } from "@/components/projects/stage-dependency-editor";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { toast } from "sonner";
import { Trash2, GripVertical, AlertTriangle, CalendarOff, Info } from "lucide-react";
import { allocationOverload, buildLoadMap } from "@/lib/projects/overload";
import { leaveHoursInRange, type LeaveInterval } from "@/lib/projects/leave-capacity";
import { useResourceSchedules, buildDailyLimitMap, dailyHoursFor } from "@/lib/projects/use-resource-schedules";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/projects/gantt-utils";
import { useDateLocale } from "@/i18n/use-date-locale";
import type { PlannerAdapter } from "@/lib/projects/planner-adapter";
import type { DepType } from "@/lib/projects/dependencies";
import { useProjectPlannerAdapter } from "@/lib/projects/use-project-planner-adapter";
import { GanttOutlineColumn, type GanttHierarchyNode } from "@/components/projects/gantt-outline-column";

export type { GanttHierarchyNode };

/**
 * A payment milestone to render in the timeline lane above the stages.
 * Optional — when omitted the lane is hidden.
 */
export interface PaymentMilestone {
  id: string;
  label: string;
  /** ISO yyyy-mm-dd resolved date (already evaluated from trigger). */
  date: string;
  /** Absolute € amount (already resolved from % if applicable). */
  amount: number;
  status?: "planned" | "invoiced" | "paid";
  note?: string | null;
}

export type StageWithProject = StageWithAllocations & { projectId: string };

import type {
  StageBudgetControl,
  AllocationActuals,
} from "@/lib/projects/use-stage-budget-control";

interface Props {
  /**
   * `projectId` is kept for backwards compatibility with callers that pass
   * it; the Gantt component itself never reads it. The scoping ID lives on
   * each stage row (`stage.projectId`) and on adapter mutation payloads.
   */
  projectId?: string;
  stages: StageWithProject[];
  origin: Date;
  totalDays: number;
  dayWidth: number;
  resources: Resource[];
  embedded?: boolean;
  /**
   * Planner adapter — one instance per Gantt mounting. ProjectGantt /
   * QuoteGantt build this from their respective hook stacks. The adapter
   * also drives feature flags (baseline ghost, leave/overload badges, etc.).
   */
  adapter: PlannerAdapter;
  /**
   * Optional budget control snapshot. When provided, the Gantt overlays a
   * compact per-stage badge (remaining budget, est. hours, planned ahead,
   * projected over/under) and shows per-allocation actual logged hours +
   * cost consumed. Caller is responsible for permission gating.
   */
  budgetByStage?: Map<string, StageBudgetControl>;
  budgetByAllocation?: Map<string, AllocationActuals>;
  showFinancials?: boolean;
  /** Optional avg sale-per-hour used to derive *implied* hours for stages
   *  that have a budget but no resource allocations. Lets non-admin users
   *  see roughly how much effort a fixed-fee stage represents. */
  impliedHourRate?: number;
  /** Optional avg cost-per-hour used to derive *implied* cost for stages
   *  without resource allocations (paired with impliedHourRate). */
  impliedCostRate?: number;
  /** Payment milestones to render in the lane above the stage rows. */
  milestones?: PaymentMilestone[];
  /**
   * Optional hierarchy map driving the left outline tree. When present,
   * GanttChart renders a sticky left outline column with WBS numbering,
   * indentation guides, collapsible parents, and renders parent rows as
   * compact "summary" bars (no allocations, no drag).
   */
  hierarchy?: Map<string, GanttHierarchyNode>;
  collapsed?: Set<string>;
  onToggleCollapse?: (stageId: string) => void;
  /** Per-stage collapse of the allocation/resource sub-rows. */
  resourcesCollapsed?: Set<string>;
  onToggleResourcesCollapse?: (stageId: string) => void;
  /** Width (px) of the left outline column. 0 / undefined hides it. */
  outlineWidth?: number;
  /** Optional row selection for outline column. */
  selectedStageId?: string | null;
  onSelectStage?: (stageId: string) => void;
  /** Inline rename from the outline column. */
  onRenameStage?: (stageId: string, name: string) => Promise<unknown> | unknown;
  /** Reorder a stage within its siblings (1-based position). */
  onReorderStage?: (stageId: string, newPosition: number) => Promise<unknown> | unknown;
  /** Insert a stage relative to an anchor row. */
  onInsertStage?: (
    anchorId: string,
    where: "above" | "below" | "child" | "milestone",
  ) => Promise<unknown> | unknown;
  /** Delete a stage by id. */
  onDeleteStage?: (id: string) => Promise<unknown> | unknown;
  /** Cascading bounds editor — wire to adapter.updateStage to inherit FS cascade. */
  onUpdateStageBounds?: (args: { id: string; projectId: string; start_date: string; end_date: string }) => Promise<unknown> | unknown;
  /** Budget edit for leaf rows (parents stay rollup). */
  onUpdateStageBudget?: (id: string, projectId: string, budget: number) => Promise<unknown> | unknown;
  /** Append a brand-new root stage from the trailing "+" row (used when empty). */
  onAppendRoot?: () => Promise<unknown> | unknown;
  /** Called while the user drags the WBS / Gantt splitter handle. */
  onResizeOutline?: (width: number) => void;
}

const STAGE_ROW_H = 56;
const SUMMARY_ROW_H = 40;
const ALLOC_ROW_H = 32;
const STAGE_GAP = 16;
const ROW_SPACING = 16; // matches `space-y-4` between sibling rows
const TOP_PADDING = 16; // matches `py-4` top padding

interface DragState {
  type: "move" | "resize-l" | "resize-r" | "stage-move" | "stage-resize-l" | "stage-resize-r";
  id: string;
  projectId: string;
  startX: number;
  origStart: string;
  origEnd: string;
}

interface LinkDragState {
  fromStageId: string;
  fromSide: "start" | "end";
  pointerX: number;
  pointerY: number;
  toSide: "start" | "end" | null;
  direction?: "outgoing" | "incoming";
  /** If set, this drag is re-routing an existing dependency. The original
   *  dep is replaced (delete + create) on a successful commit. */
  replacesDepId?: string;
}

export function GanttChart({
  stages: stagesAll,
  origin,
  totalDays,
  dayWidth,
  resources,
  adapter,
  budgetByStage,
  budgetByAllocation,
  showFinancials,
  impliedHourRate,
  impliedCostRate,
  milestones,
  hierarchy,
  collapsed,
  onToggleCollapse,
  resourcesCollapsed,
  onToggleResourcesCollapse,
  outlineWidth = 0,
  selectedStageId,
  onSelectStage,
  onRenameStage,
  onReorderStage,
  onInsertStage,
  onDeleteStage,
  onUpdateStageBounds,
  onUpdateStageBudget,
  onAppendRoot,
  onResizeOutline,
}: Props) {
  const { t } = useTranslation("projects");
  const dateLocale = useDateLocale();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draftDates, setDraftDates] = useState<Map<string, { start: string; end: string }>>(new Map());
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const [link, setLink] = useState<LinkDragState | null>(null);
  const [linkHoverStage, setLinkHoverStage] = useState<string | null>(null);
  const [editingDep, setEditingDep] = useState<{ id: string; x: number; y: number } | null>(null);
  const linkRef = useRef<LinkDragState | null>(null);
  const linkHoverStageRef = useRef<string | null>(null);

  const updateLink = (next: LinkDragState | null) => {
    linkRef.current = next;
    setLink(next);
  };

  const updateLinkHoverStage = (next: string | null) => {
    linkHoverStageRef.current = next;
    setLinkHoverStage(next);
  };

  // Hide stages whose ancestor chain contains a collapsed parent.
  const stages = useMemo(() => {
    if (!hierarchy || !collapsed || collapsed.size === 0) return stagesAll;
    return stagesAll.filter((s) => {
      let cur = hierarchy.get(s.id)?.parentId ?? null;
      while (cur) {
        if (collapsed.has(cur)) return false;
        cur = hierarchy.get(cur)?.parentId ?? null;
      }
      return true;
    });
  }, [stagesAll, hierarchy, collapsed]);

  // Build children index from the full (unfiltered) stages list so summary
  // moves shift hidden/collapsed descendants too.
  const childrenIndex = useMemo(() => {
    const m = new Map<string, StageWithProject[]>();
    for (const s of stagesAll) {
      const pid = (s as { parent_stage_id?: string | null }).parent_stage_id ?? null;
      if (!pid) continue;
      const arr = m.get(pid) ?? [];
      arr.push(s);
      m.set(pid, arr);
    }
    return m;
  }, [stagesAll]);

  const collectDescendants = (id: string): StageWithProject[] => {
    const out: StageWithProject[] = [];
    const walk = (pid: string) => {
      const kids = childrenIndex.get(pid) ?? [];
      for (const k of kids) {
        out.push(k);
        walk(k.id);
      }
    };
    walk(id);
    return out;
  };

  // Per-stage row height (matches the bar canvas and the outline column).
  const rowHeightFor = (stageId: string): number => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return STAGE_ROW_H + STAGE_GAP;
    const isSummary = hierarchy?.get(stageId)?.isSummary ?? false;
    if (isSummary) return SUMMARY_ROW_H + STAGE_GAP;
    const resHidden = resourcesCollapsed?.has(stageId) ?? false;
    const allocRows = resHidden ? 0 : Math.max(stage.allocations.length, 0);
    return STAGE_ROW_H + allocRows * (ALLOC_ROW_H + 4) + STAGE_GAP;
  };

  // All planner mutations + dependency reads come from the adapter — there is
  // no direct pm_* coupling left in this component.
  const deps = adapter.dependencies;
  const defaultRates = adapter.defaultRates;
  const features = adapter.features;

  // Approved-leave intervals per resource — used to flag allocations that
  // overlap days where the resource is unavailable. These remain CALCULATED
  // (not blocking): the user still sees the allocation, but the bar/tooltip
  // surface that delivery capacity is reduced. Only fetched in modes that
  // opt-in (project mode); quote mode never reads it.
  const { data: leaveByResource } = useQuery({
    queryKey: ["gantt-leave"],
    enabled: features.leave,
    queryFn: async (): Promise<Map<string, LeaveInterval[]>> => {
      const { data: rs } = await supabase.from("pm_resources_public").select("id, collaborator_id");
      const collabToRes = new Map<string, string>();
      for (const r of (rs ?? []) as Array<{ id: string; collaborator_id: string | null }>) {
        if (r.collaborator_id) collabToRes.set(r.collaborator_id, r.id);
      }
      const { data: lv } = await supabase
        .from("vacation_requests")
        .select("collaborator_id, data_inicio, data_fim, estado")
        .in("estado", ["aprovado", "aprovada"]);
      const m = new Map<string, LeaveInterval[]>();
      for (const l of (lv ?? []) as Array<{ collaborator_id: string; data_inicio: string; data_fim: string }>) {
        const id = collabToRes.get(l.collaborator_id);
        if (!id) continue;
        const arr = m.get(id) ?? [];
        arr.push({ start: parseISO(l.data_inicio), end: parseISO(l.data_fim) });
        m.set(id, arr);
      }
      return m;
    },
  });
  const { data: holidaySet } = useQuery({
    queryKey: ["gantt-holidays"],
    enabled: features.holidayShading || features.leave,
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await supabase.from("holidays").select("data");
      return new Set(((data ?? []) as Array<{ data: string }>).map((h) => h.data));
    },
  });

  const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const { data: schedules } = useResourceSchedules();
  const dailyLimitMap = useMemo(() => buildDailyLimitMap(schedules), [schedules]);

  const loadMap = useMemo(() => {
    const flat = stages.flatMap((s) =>
      s.allocations.map((a) => {
        const draft = draftDates.get(a.id);
        const aWithStatus = a as typeof a & { status?: "tentative" | "committed" };
        return {
          id: a.id,
          resource_id: a.resource_id,
          start_date: draft?.start ?? a.start_date,
          end_date: draft?.end ?? a.end_date,
          hours_per_day: Number(a.hours_per_day),
          status: aWithStatus.status ?? "committed",
        };
      }),
    );
    return buildLoadMap(flat);
  }, [stages, draftDates]);

  const months = useMemo(() => {
    const days = eachDayOfInterval({ start: origin, end: addDays(origin, totalDays - 1) });
    const out: { label: string; days: number; startIdx: number }[] = [];
    let cur = days[0];
    let count = 0;
    let startIdx = 0;
    days.forEach((d, i) => {
      if (i === 0) return;
      if (!isSameMonth(d, cur)) {
        out.push({ label: format(cur, "MMMM yyyy", { locale: dateLocale }), days: count + 1, startIdx });
        cur = d;
        startIdx = i;
        count = 0;
      } else {
        count++;
      }
    });
    out.push({ label: format(cur, "MMMM yyyy", { locale: dateLocale }), days: count + 1, startIdx });
    return out;
  }, [origin, totalDays, dateLocale]);

  const today = new Date();
  const todayX = differenceInCalendarDays(today, origin) * dayWidth;
  const todayInRange = todayX >= 0 && todayX <= totalDays * dayWidth;

  const stageLayouts = useMemo(() => {
    const out = new Map<string, { top: number; height: number; x: number; w: number; anchorY: number }>();
    let cursor = 16;
    stages.forEach((stage, i) => {
      const draft = draftDates.get(stage.id);
      const sStart = draft?.start ?? stage.start_date;
      const sEnd = draft?.end ?? stage.end_date;
      const isMilestone = (stage as { is_milestone?: boolean }).is_milestone ?? false;
      const isSummary = hierarchy?.get(stage.id)?.isSummary ?? false;
      // For milestones, anchor x/w to the *visible* diamond tip (not the
      // wider bounding box) so dependency arrows land exactly on the picker.
      const milestoneHalf = Math.max(14, STAGE_ROW_H * 0.55) * (Math.SQRT2 / 2);
      const x = isMilestone
        ? differenceInCalendarDays(new Date(sStart), origin) * dayWidth - milestoneHalf
        : differenceInCalendarDays(new Date(sStart), origin) * dayWidth;
      const rawW = isMilestone ? milestoneHalf * 2 : dayCount(sStart, sEnd) * dayWidth;
      const w = isSummary ? Math.max(40, rawW) : rawW;
      const resHidden = resourcesCollapsed?.has(stage.id) ?? false;
      const allocCount = resHidden ? 0 : Math.max(stage.allocations.length, 0);
      const height = isSummary
        ? SUMMARY_ROW_H + STAGE_GAP
        : STAGE_ROW_H + allocCount * (ALLOC_ROW_H + 4) + STAGE_GAP;
      if (i > 0) cursor += 16;
      out.set(stage.id, { top: cursor, height, x, w, anchorY: cursor + (isSummary ? 18 : STAGE_ROW_H / 2) });
      cursor += height;
    });
    return out;
  }, [stages, draftDates, origin, dayWidth, hierarchy, resourcesCollapsed]);

  const visibleDeps = useMemo(() => {
    if (!deps) return [];
    return deps.filter((d) => stageLayouts.has(d.predecessor_id) && stageLayouts.has(d.successor_id));
  }, [deps, stageLayouts]);

  function startDrag(e: React.PointerEvent, state: DragState) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(state);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (link) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        let hit: string | null = null;
        let toSide: "start" | "end" | null = null;
        const TIP_HIT_X = 18;
        const TIP_HIT_Y = 20;
        for (const [sid, geo] of stageLayouts.entries()) {
          if (sid === link.fromStageId) continue;
          const startDx = Math.abs(px - geo.x);
          const endDx = Math.abs(px - (geo.x + geo.w));
          if (Math.abs(py - geo.anchorY) <= TIP_HIT_Y && (startDx <= TIP_HIT_X || endDx <= TIP_HIT_X)) {
            hit = sid;
            toSide = startDx <= endDx ? "start" : "end";
            break;
          }
        }
        updateLink({ ...link, pointerX: px, pointerY: py, toSide });
        updateLinkHoverStage(hit);
      }
    }
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const days = Math.round(dx / dayWidth);
    if (days === 0) {
      setDraftDates((m) => {
        const next = new Map(m);
        next.delete(drag.id);
        if (drag.type === "stage-move" && hierarchy?.get(drag.id)?.isSummary) {
          for (const d of collectDescendants(drag.id)) next.delete(d.id);
        }
        return next;
      });
      return;
    }
    const origStart = new Date(drag.origStart);
    const origEnd = new Date(drag.origEnd);
    let newStart = drag.origStart;
    let newEnd = drag.origEnd;

    if (drag.type === "move" || drag.type === "stage-move") {
      newStart = format(addDays(origStart, days), "yyyy-MM-dd");
      newEnd = format(addDays(origEnd, days), "yyyy-MM-dd");
    } else if (drag.type === "resize-l" || drag.type === "stage-resize-l") {
      const s = addDays(origStart, days);
      if (s <= origEnd) newStart = format(s, "yyyy-MM-dd");
    } else if (drag.type === "resize-r" || drag.type === "stage-resize-r") {
      const en = addDays(origEnd, days);
      if (en >= origStart) newEnd = format(en, "yyyy-MM-dd");
    }
    setDraftDates((m) => {
      const next = new Map(m).set(drag.id, { start: newStart, end: newEnd });
      // When moving a summary (parent) bar, shift all descendants by the
      // same delta so the preview shows the entire group sliding together.
      if (drag.type === "stage-move" && hierarchy?.get(drag.id)?.isSummary) {
        for (const d of collectDescendants(drag.id)) {
          if (hierarchy?.get(d.id)?.isSummary) continue;
          next.set(d.id, {
            start: format(addDays(new Date(d.start_date), days), "yyyy-MM-dd"),
            end: format(addDays(new Date(d.end_date), days), "yyyy-MM-dd"),
          });
        }
      }
      return next;
    });
  }

  function startLinkDrag(e: React.PointerEvent, fromStageId: string, fromSide: "start" | "end") {
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    updateLink({
      fromStageId,
      fromSide,
      pointerX: e.clientX - rect.left,
      pointerY: e.clientY - rect.top,
      toSide: null,
      direction: "outgoing",
    });
    // Because pointer capture would otherwise route pointerup to the source
    // handle (bypassing the canvas onPointerUp), bind window-level listeners
    // so the drag always terminates cleanly even when released off-canvas.
    const onUp = () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      commitLinkDrag();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // FS/SS/FF/SF inference from the drag handles:
  //   from end  → to start = FS  | to end = FF
  //   from start → to start = SS | to end = SF
  function inferDepType(
    fromSide: "start" | "end",
    toSide: "start" | "end",
  ): "FS" | "SS" | "FF" | "SF" {
    if (fromSide === "end" && toSide === "start") return "FS";
    if (fromSide === "end" && toSide === "end") return "FF";
    if (fromSide === "start" && toSide === "start") return "SS";
    return "SF";
  }

  function commitLinkDrag() {
    const activeLink = linkRef.current;
    if (!activeLink) return;
    const target = linkHoverStageRef.current;
    const toSide = activeLink.toSide;
    const replaces = activeLink.replacesDepId;
    const fromStageId = activeLink.fromStageId;
    const fromSide = activeLink.fromSide;
    const direction = activeLink.direction ?? "outgoing";
    updateLink(null);
    updateLinkHoverStage(null);
    if (!target || target === fromStageId || !toSide) return;
    const predecessor_id = direction === "incoming" ? target : fromStageId;
    const successor_id = direction === "incoming" ? fromStageId : target;
    const type = direction === "incoming" ? inferDepType(toSide, fromSide) : inferDepType(fromSide, toSide);
    const create = () =>
      adapter
        .createDependency({ predecessor_id, successor_id, type, lag_days: 0 })
        .then(() => toast.success(t("gantt.toasts.linkCreated")))
        .catch((err: unknown) => toast.error((err as Error).message));
    if (replaces && adapter.deleteDependency) {
      adapter
        .deleteDependency(replaces)
        .then(create)
        .catch((err: unknown) => toast.error((err as Error).message));
    } else {
      create();
    }
  }

  async function commitDrag() {
    if (!drag) return;
    const dragState = drag;
    const draft = draftDates.get(dragState.id);
    setDrag(null);
    if (!draft) return;
    const isSummary = hierarchy?.get(dragState.id)?.isSummary ?? false;
    const summaryMove = isSummary && dragState.type === "stage-move";
    const descendants = summaryMove ? collectDescendants(dragState.id) : [];
    setDraftDates((m) => {
      const next = new Map(m);
      next.delete(dragState.id);
      for (const d of descendants) next.delete(d.id);
      return next;
    });
    try {
      if (dragState.type.startsWith("stage")) {
        if (summaryMove) {
          // Parent-bar move: shift every non-summary descendant by the same
          // delta. Persisted parent dates will roll up from descendants on
          // the next read.
          const days = differenceInCalendarDays(new Date(draft.start), new Date(dragState.origStart));
          for (const d of descendants) {
            if (hierarchy?.get(d.id)?.isSummary) continue;
            await adapter.updateStage({
              id: d.id,
              projectId: d.projectId,
              start_date: format(addDays(new Date(d.start_date), days), "yyyy-MM-dd"),
              end_date: format(addDays(new Date(d.end_date), days), "yyyy-MM-dd"),
            });
          }
        } else {
          await adapter.updateStage({
            id: dragState.id,
            projectId: dragState.projectId,
            start_date: draft.start,
            end_date: draft.end,
          });
        }
      } else {
        await adapter.updateAllocation({
          id: dragState.id,
          projectId: dragState.projectId,
          patch: { start_date: draft.start, end_date: draft.end },
        });
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function handleDrop(e: React.DragEvent, stage: StageWithProject) {
    e.preventDefault();
    const resourceId = e.dataTransfer.getData("application/x-resource-id");
    const movedAlloc = e.dataTransfer.getData("application/x-allocation");
    if (!resourceId && !movedAlloc) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dropDayOffset = Math.max(0, Math.round(x / dayWidth));
    const startDate = format(addDays(origin, dropDayOffset), "yyyy-MM-dd");

    if (movedAlloc) {
      try {
        const parsed = JSON.parse(movedAlloc) as { allocationId: string; fromProjectId: string; durationDays: number };
        // Cross-project allocation moves only make sense when the adapter
        // exposes that capability. Quote mode disables this.
        if (!features.crossProjectMove && parsed.fromProjectId !== stage.projectId) return;
        const stageEnd = new Date(stage.end_date);
        let endCandidate = addDays(addDays(origin, dropDayOffset), Math.max(0, parsed.durationDays - 1));
        if (endCandidate > stageEnd) endCandidate = stageEnd;
        const endDate = format(endCandidate, "yyyy-MM-dd");
        adapter
          .updateAllocation({
            id: parsed.allocationId,
            projectId: parsed.fromProjectId,
            patch: { stage_id: stage.id, start_date: startDate, end_date: endDate },
          })
          .then(() => toast.success(t("gantt.toasts.allocationMoved")))
          .catch((err: unknown) => toast.error((err as Error).message));
      } catch (err) {
        toast.error((err as Error).message);
      }
      return;
    }

    // New resource drop — span the full stage so the user doesn't have to
    // stretch the allocation after placement.
    const fullStart = stage.start_date;
    const fullEnd = stage.end_date;

    adapter
      .createAllocation({
        stage_id: stage.id,
        resource_id: resourceId,
        start_date: startDate,
        end_date: endDate,
        hours_per_day: 6,
        projectId: stage.projectId,
      })
      .then(() => toast.success(t("gantt.toasts.resourceAllocated")))
      .catch((err: unknown) => toast.error((err as Error).message));
  }

  // Header band heights — months (h-7=28) + days/weeks/quarters band.
  // Day band: h-9 (36) when dayWidth ≥ 14, otherwise h-5 (20).
  const headerHeight = 28 + (dayWidth >= 14 ? 36 : 20);
  const milestonesHeight = milestones && milestones.length > 0 ? 32 : 0;

  // Dependency labels for the WBS "Dep." column: "<predWbs>FS+2d".
  const depLabels = useMemo(() => {
    const wbsOf = (id: string) => hierarchy?.get(id)?.wbs ?? "";
    const m = new Map<string, string>();
    for (const d of (adapter.dependencies ?? [])) {
      const succ = d.successor_id;
      const w = wbsOf(d.predecessor_id);
      if (!w) continue;
      const lag = d.lag_days ?? 0;
      const tag = `${w}${d.type ?? "FS"}${lag ? (lag > 0 ? `+${lag}d` : `${lag}d`) : ""}`;
      const prev = m.get(succ);
      m.set(succ, prev ? `${prev}, ${tag}` : tag);
    }
    return m;
  }, [adapter.dependencies, hierarchy]);

  return (
    <div className="flex" style={{ width: outlineWidth + (onResizeOutline ? 6 : 0) + totalDays * dayWidth }}>
      {outlineWidth > 0 && hierarchy && onToggleCollapse && (
        <GanttOutlineColumn
          visibleStages={stages}
          hierarchy={hierarchy}
          collapsed={collapsed ?? new Set()}
          onToggleCollapse={onToggleCollapse}
          width={outlineWidth}
          headerHeight={headerHeight}
          rowHeightFor={rowHeightFor}
          rowGap={ROW_SPACING}
          topPadding={milestonesHeight + TOP_PADDING}
          selectedStageId={selectedStageId}
          onSelectStage={onSelectStage}
          onRenameStage={onRenameStage}
          onReorderStage={onReorderStage}
          onInsertStage={onInsertStage}
          onDeleteStage={onDeleteStage}
          resourcesCollapsed={resourcesCollapsed}
          onToggleResourcesCollapse={onToggleResourcesCollapse}
          onUpdateStageBounds={onUpdateStageBounds}
          onUpdateStageBudget={onUpdateStageBudget}
          dependencyLabels={depLabels}
          onAppendRoot={onAppendRoot}
        />
      )}
      {outlineWidth > 0 && onResizeOutline && (
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize WBS column"
          onPointerDown={(e) => {
            const startX = e.clientX;
            const startW = outlineWidth;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const onMove = (ev: PointerEvent) => {
              const next = Math.min(900, Math.max(280, startW + (ev.clientX - startX)));
              onResizeOutline(next);
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
          className="sticky z-30 shrink-0 cursor-col-resize select-none bg-transparent hover:bg-primary/30"
          style={{ left: outlineWidth, width: 6, alignSelf: "stretch" }}
        />
      )}
    <div
      ref={canvasRef}
      className="relative select-none"
      style={{ ["--day-width" as string]: `${dayWidth}px`, width: totalDays * dayWidth }}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        commitDrag();
        commitLinkDrag();
      }}
      onPointerCancel={() => {
        commitDrag();
        commitLinkDrag();
      }}
    >
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-7 items-stretch border-b border-border/60">
          {months.map((m, i) => {
            const cellW = m.days * dayWidth;
            // Adaptive label: full → abbreviated → numeric, based on cell width.
            const d = addDays(origin, m.startIdx);
            const label =
              cellW >= 110
                ? format(d, "MMMM yyyy", { locale: dateLocale })
                : cellW >= 70
                ? format(d, "MMM yyyy", { locale: dateLocale })
                : cellW >= 44
                ? format(d, "MMM ''yy", { locale: dateLocale })
                : cellW >= 26
                ? format(d, "MM/yy", { locale: dateLocale })
                : cellW >= 14
                ? format(d, "MM", { locale: dateLocale })
                : "";
            return (
              <div
                key={i}
                className="flex items-center justify-center border-l border-border/40 px-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/80 first:border-l-0 overflow-hidden whitespace-nowrap"
                style={{
                  width: cellW,
                  minWidth: cellW,
                  backgroundColor: i % 2 === 0 ? "oklch(0 0 0 / 0.06)" : "oklch(0 0 0 / 0.015)",
                }}
                title={format(d, "MMMM yyyy", { locale: dateLocale })}
              >
                {label}
              </div>
            );
          })}
        </div>
        {dayWidth >= 14 && (
          <div className="flex h-9">
            {Array.from({ length: totalDays }).map((_, i) => {
              const d = addDays(origin, i);
              const isWeek = isWeekend(d);
              const isMonStart = startOfWeek(d, { weekStartsOn: 1 }).getDate() === d.getDate();
              const isToday = differenceInCalendarDays(d, today) === 0;
              const weekday = format(d, "EEEEE", { locale: dateLocale });
              return (
                <div
                  key={i}
                  className={`relative flex flex-col items-center justify-center gap-0 leading-none ${
                    isWeek ? "bg-muted/30 text-muted-foreground/60" : "text-muted-foreground"
                  } ${isMonStart ? "border-l border-canvas-line-strong" : "border-l border-border/20"}`}
                  style={{ width: dayWidth, minWidth: dayWidth }}
                >
                  <span className="text-[9px] uppercase tracking-wide">{weekday}</span>
                  <span
                    className={`mt-0.5 font-mono text-[11px] ${
                      isToday
                        ? "flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold"
                        : ""
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {dayWidth < 14 && dayWidth >= 5 && (
          <div className="flex h-5">
            {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, wi) => {
              const startDay = wi * 7;
              const d = addDays(origin, startDay);
              const daysInCell = Math.min(7, totalDays - startDay);
              return (
                <div
                  key={wi}
                  className="flex items-center justify-center border-l border-border/30 text-[9px] text-muted-foreground"
                  style={{ width: daysInCell * dayWidth, minWidth: daysInCell * dayWidth }}
                >
                  {format(d, "d/M", { locale: dateLocale })}
                </div>
              );
            })}
          </div>
        )}
        {dayWidth < 5 && (
          <div className="flex h-5">
            {(() => {
              const cells: { label: string; days: number }[] = [];
              for (let i = 0; i < totalDays; ) {
                const d = addDays(origin, i);
                const q = Math.floor(d.getMonth() / 3) + 1;
                const label = `Q${q} ${d.getFullYear()}`;
                let span = 0;
                while (i + span < totalDays) {
                  const dd = addDays(origin, i + span);
                  const qq = Math.floor(dd.getMonth() / 3) + 1;
                  if (qq !== q || dd.getFullYear() !== d.getFullYear()) break;
                  span++;
                }
                cells.push({ label, days: span });
                i += span;
              }
              return cells.map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-center border-l border-border/30 text-[9px] text-muted-foreground"
                  style={{ width: c.days * dayWidth, minWidth: c.days * dayWidth }}
                >
                  {c.label}
                </div>
              ));
            })()}
          </div>
        )}
        {todayInRange && (
          <div
            className="pointer-events-none absolute bottom-0 z-10 h-full w-px bg-primary/60"
            style={{ left: todayX }}
          />
        )}
      </div>

      {milestones && milestones.length > 0 && (
        <div className="relative h-8 border-b border-border/40 bg-background/40">
          <div className="absolute left-1 top-1/2 -translate-y-1/2 rounded-sm bg-muted px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {t("gantt.milestones.laneLabel", { defaultValue: "Payments" })}
          </div>
          {milestones.map((m) => {
            const x = differenceInCalendarDays(parseISO(m.date), origin) * dayWidth;
            if (x < 0 || x > totalDays * dayWidth) return null;
            const color =
              m.status === "paid"
                ? "bg-emerald-600"
                : m.status === "invoiced"
                  ? "bg-amber-500"
                  : "bg-foreground/70";
            return (
              <TooltipProvider key={m.id} delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      style={{ left: x }}
                    >
                      <div
                        className={`h-3 w-3 rotate-45 ${color} shadow ring-2 ring-background`}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="font-semibold">{m.label}</div>
                    <div className="font-mono">
                      {euros(m.amount)} ·{" "}
                      {format(parseISO(m.date), "d MMM yyyy", { locale: dateLocale })}
                    </div>
                    {m.status && (
                      <div className="capitalize text-muted-foreground">{m.status}</div>
                    )}
                    {m.note && (
                      <div className="mt-1 max-w-xs text-muted-foreground">{m.note}</div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      )}

      <div className="relative gantt-canvas-bg gantt-week-marker" style={{ minHeight: stages.length * 200 }}>
        {months.map((m, i) => (
          <div
            key={`mb-${i}`}
            className="pointer-events-none absolute top-0 h-full"
            style={{
              left: m.startIdx * dayWidth,
              width: m.days * dayWidth,
              backgroundColor: i % 2 === 0 ? "oklch(0 0 0 / 0.05)" : "oklch(0 0 0 / 0.01)",
            }}
          />
        ))}
        {milestones?.map((m) => {
          const x = differenceInCalendarDays(parseISO(m.date), origin) * dayWidth;
          if (x < 0 || x > totalDays * dayWidth) return null;
          return (
            <div
              key={`ms-line-${m.id}`}
              className="pointer-events-none absolute top-0 z-0 h-full border-l border-dashed border-foreground/15"
              style={{ left: x }}
            />
          );
        })}
        {Array.from({ length: totalDays }).map((_, i) => {
          const d = addDays(origin, i);
          if (!isWeekend(d)) return null;
          return (
            <div
              key={`we-${i}`}
              className="pointer-events-none absolute top-0 h-full bg-muted/40"
              style={{ left: i * dayWidth, width: dayWidth }}
            />
          );
        })}

        {todayInRange && (
          <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-primary" style={{ left: todayX }}>
            <div className="absolute -top-6 -translate-x-1/2 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              today
            </div>
          </div>
        )}

        <div className="relative space-y-4 py-4">
          {stages.map((stage) => {
            const draft = draftDates.get(stage.id);
            const sStart = draft?.start ?? stage.start_date;
            const sEnd = draft?.end ?? stage.end_date;
            const stageX = differenceInCalendarDays(new Date(sStart), origin) * dayWidth;
            const stageW = dayCount(sStart, sEnd) * dayWidth;
            const node = hierarchy?.get(stage.id);
            const isSummary = node?.isSummary ?? false;

            // Summary / rollup row — slim non-interactive bar spanning the
            // group's range. No allocations rendered, no drag handles.
            if (isSummary) {
              const w = Math.max(40, stageW);
              const BAR_H = 8;
              const CAP_H = 6;
              const CAP_W = 6;
              const SVG_H = BAR_H + CAP_H;
              // Merlin-style: thick rounded bar with downward triangular flags
              // at each end. Single SVG path so the cap blends with the bar.
              const path = [
                `M 0 0`,
                `H ${w}`,
                `V ${BAR_H}`,
                `L ${w - CAP_W} ${SVG_H}`,
                `L ${w - CAP_W} ${BAR_H}`,
                `H ${CAP_W}`,
                `L ${CAP_W} ${SVG_H}`,
                `L 0 ${BAR_H}`,
                `Z`,
              ].join(" ");
              return (
                <div
                  key={stage.id}
                  className="relative group"
                  style={{ height: SUMMARY_ROW_H + STAGE_GAP }}
                  title={`${stage.name} · ${fmt(sStart)} → ${fmt(sEnd)}`}
                  onMouseEnter={() => setHoveredStage(stage.id)}
                  onMouseLeave={() => setHoveredStage((s) => (s === stage.id ? null : s))}
                >
                  <div
                    className="absolute top-0 truncate text-[10px] font-semibold uppercase tracking-wider text-foreground/80"
                    style={{ left: stageX, maxWidth: Math.max(120, w) }}
                  >
                    {stage.name}
                  </div>
                  <svg
                    className="pointer-events-none absolute"
                    style={{ left: stageX, top: 14, width: w, height: SVG_H }}
                    viewBox={`0 0 ${w} ${SVG_H}`}
                    preserveAspectRatio="none"
                  >
                    <path
                      d={path}
                      fill="hsl(var(--foreground))"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={1}
                      strokeLinejoin="round"
                    />
                  </svg>
                  {/* Drag-to-move overlay: shifts every descendant by the same delta. */}
                  <div
                    className="absolute z-20 cursor-grab active:cursor-grabbing"
                    style={{ left: stageX, top: 12, width: w, height: SVG_H + 4 }}
                    onPointerDown={(e) => {
                      onSelectStage?.(stage.id);
                      startDrag(e, {
                        type: "stage-move",
                        id: stage.id,
                        projectId: stage.projectId,
                        startX: e.clientX,
                        origStart: sStart,
                        origEnd: sEnd,
                      });
                    }}
                  />
                  {/* Drop indicator when an arrow is being dragged onto this parent. */}
                  {link && link.fromStageId !== stage.id && linkHoverStage === stage.id && link.toSide && (
                    <div
                      className="pointer-events-none absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-primary/80 bg-primary/15"
                      style={{ left: link.toSide === "start" ? stageX : stageX + w, top: 14 + BAR_H / 2 }}
                    />
                  )}
                  {/* Dependency anchors — parent bars can be linked just like leaves. */}
                  <div
                    onPointerDown={(e) => startLinkDrag(e, stage.id, "start")}
                    className="absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-40 shadow transition hover:opacity-100 group-hover:opacity-100"
                    style={{ left: stageX, top: 14 + BAR_H / 2 }}
                    title={t("gantt.stage.linkFromStart")}
                  />
                  <div
                    onPointerDown={(e) => startLinkDrag(e, stage.id, "end")}
                    className="absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-40 shadow transition hover:opacity-100 group-hover:opacity-100"
                    style={{ left: stageX + w, top: 14 + BAR_H / 2 }}
                    title={t("gantt.stage.linkFromEnd")}
                  />
                </div>
              );
            }



            // Baseline ghost (rendered behind the working stage bar)
            const stageWithBaseline = stage as typeof stage & {
              baseline_start_date?: string | null;
              baseline_end_date?: string | null;
              baseline_locked_at?: string | null;
            };
            const hasBaseline =
              !!stageWithBaseline.baseline_locked_at &&
              !!stageWithBaseline.baseline_start_date &&
              !!stageWithBaseline.baseline_end_date;
            const baseX = hasBaseline
              ? differenceInCalendarDays(new Date(stageWithBaseline.baseline_start_date!), origin) * dayWidth
              : 0;
            const baseW = hasBaseline
              ? dayCount(stageWithBaseline.baseline_start_date!, stageWithBaseline.baseline_end_date!) * dayWidth
              : 0;

            // When the parent stage is being dragged (pure shift), visually
            // shift its child allocations by the same delta so resource bars
            // follow the stage. Backend cascade already persists this on
            // commit (useUpdateStageWithCascade). Per-allocation drafts win.
            // TODO: when an allocation has a `manual_override` flag, skip the
            // shift here. Default behaviour: linked allocations follow stage.
            const stageDraftForShift = draftDates.get(stage.id);
            const stageShiftDays =
              drag?.type === "stage-move" && drag.id === stage.id && stageDraftForShift
                ? differenceInCalendarDays(new Date(stageDraftForShift.start), new Date(stage.start_date))
                : 0;
            const shiftIso = (iso: string, delta: number): string =>
              delta === 0 ? iso : format(addDays(new Date(iso), delta), "yyyy-MM-dd");

            let totalCost = 0;
            let totalSale = 0;
            let plannedHours = 0;
            for (const a of stage.allocations) {
              const aDraft = draftDates.get(a.id);
              const aS = aDraft?.start ?? shiftIso(a.start_date, stageShiftDays);
              const aE = aDraft?.end ?? shiftIso(a.end_date, stageShiftDays);
              const isOverride = !!a.resource.hourly_rate_is_override;
              totalCost += allocationCost({
                start_date: aS,
                end_date: aE,
                hours_per_day: Number(a.hours_per_day),
                hourly_rate: effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates, isOverride),
              });
              totalSale += allocationCost({
                start_date: aS,
                end_date: aE,
                hours_per_day: Number(a.hours_per_day),
                hourly_rate: effectiveSaleRate(a.resource.hourly_rate, a.resource.id, defaultRates, isOverride),
              });
              plannedHours += workingDays(aS, aE) * Number(a.hours_per_day);
            }
            const budget = Number(stage.budget);
            // Implied hours: when a stage has no resource allocations but a
            // budget exists, derive effort from budget / avg sale rate so
            // users without financial access still see "≈Xh".
            const impliedHours =
              plannedHours === 0 && budget > 0 && impliedHourRate && impliedHourRate > 0
                ? budget / impliedHourRate
                : 0;
            const displayHours = plannedHours > 0 ? plannedHours : impliedHours;
            const hoursAreImplied = plannedHours === 0 && impliedHours > 0;
            // When no resource allocations exist, derive cost/sale from
            // implied hours × HR pricing averages so admins see expected
            // figures rather than zeros.
            if (hoursAreImplied) {
              if (impliedCostRate && impliedCostRate > 0) totalCost = impliedHours * impliedCostRate;
              if (impliedHourRate && impliedHourRate > 0) totalSale = impliedHours * impliedHourRate;
            }
            const margin = totalSale - totalCost;
            const marginPct = totalSale > 0 ? (margin / totalSale) * 100 : 0;
            // Planning mode: compare cost against sale value (what the fee
            // calculator is producing). Project mode: compare against the
            // approved budget ceiling.
            const compareValue = features.planningMode ? totalSale : budget;
            const pct = compareValue > 0 ? Math.min(1, totalCost / compareValue) : 0;
            const overPct = compareValue > 0 ? Math.max(0, totalCost / compareValue - 1) : 0;
            const over = compareValue > 0 && totalCost > compareValue;
            const resHidden = resourcesCollapsed?.has(stage.id) ?? false;
            const allocRows = resHidden ? 0 : Math.max(stage.allocations.length, 0);
            const rowsHeight = allocRows * (ALLOC_ROW_H + 4);

            return (
              <div
                key={stage.id}
                className="relative"
                style={{ height: STAGE_ROW_H + rowsHeight + STAGE_GAP }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoveredStage(stage.id);
                }}
                onDragLeave={() => setHoveredStage((h) => (h === stage.id ? null : h))}
                onDrop={(e) => {
                  setHoveredStage(null);
                  handleDrop(e, stage);
                }}
              >
                {hoveredStage === stage.id && (
                  <div className="pointer-events-none absolute inset-y-0 left-0 right-0 rounded-md border-2 border-dashed border-primary/60 bg-primary/5" />
                )}

                {/* Baseline ghost bar — frozen reference plan */}
                {hasBaseline && (
                  <div
                    className="pointer-events-none absolute z-0 rounded-md border border-dashed border-foreground/30 bg-muted/20"
                    style={{ left: baseX, width: baseW, top: 0, height: STAGE_ROW_H }}
                    title={t("gantt.tooltip.baselineHover", { start: stageWithBaseline.baseline_start_date, end: stageWithBaseline.baseline_end_date })}
                  >
                    <div className="absolute -top-3.5 left-1 rounded-sm bg-muted px-1 py-px font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      baseline
                    </div>
                  </div>
                )}

                {(stage as { is_milestone?: boolean }).is_milestone ? (
                  (() => {
                    const diamondSide = Math.max(14, STAGE_ROW_H * 0.55);
                    const milestoneHalf = diamondSide * (Math.SQRT2 / 2);
                    const milestoneCenter = STAGE_ROW_H / 2 + 16;
                    return (
                  <div
                    className="group absolute flex items-center"
                    style={{ left: stageX - STAGE_ROW_H / 2 - 16, width: STAGE_ROW_H + 32, top: 0, height: STAGE_ROW_H }}
                    title={`${stage.name} — ${stage.start_date}`}
                  >
                    {link && link.fromStageId !== stage.id && linkHoverStage === stage.id && link.toSide && (
                      <div
                        className="pointer-events-none absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-primary/80 bg-primary/15"
                        style={{ left: link.toSide === "start" ? milestoneCenter - milestoneHalf : milestoneCenter + milestoneHalf }}
                      />
                    )}
                    <div
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-foreground/40 shadow-sm"
                      style={{
                        width: diamondSide,
                        height: diamondSide,
                        backgroundColor: stage.color || "var(--color-foreground)",
                      }}
                    />
                    <div
                      onPointerDown={(e) => startLinkDrag(e, stage.id, "start")}
                      className="absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-40 shadow transition hover:opacity-100 group-hover:opacity-100"
                      style={{ left: milestoneCenter - milestoneHalf }}
                      title={t("gantt.stage.linkFromStart")}
                    />
                    <div
                      onPointerDown={(e) => startLinkDrag(e, stage.id, "end")}
                      className="absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-40 shadow transition hover:opacity-100 group-hover:opacity-100"
                      style={{ left: milestoneCenter + milestoneHalf }}
                      title={t("gantt.stage.linkFromEnd")}
                    />
                    <div
                      className="pointer-events-none absolute whitespace-nowrap text-xs font-semibold"
                      style={{ left: 16 + STAGE_ROW_H + 8, top: "50%", transform: "translateY(-50%)" }}
                    >
                      {stage.name}
                    </div>
                  </div>
                    );
                  })()
                ) : (() => {
                  const stageRole = hierarchy?.get(stage.id)?.role ?? "architecture";
                  const isSupplierBar = stageRole === "supplier_group" || stageRole === "supplier_phase";
                  const supplierFill = stage.color || "#94a3b8";
                  const supplierBg = isSupplierBar
                    ? `repeating-linear-gradient(135deg, ${supplierFill} 0 8px, ${supplierFill}cc 8px 16px)`
                    : undefined;
                  return (
                  <div className="group absolute" style={{ left: stageX, width: stageW, top: 0, height: STAGE_ROW_H }}>
                  {!isSupplierBar && (
                    <div className="absolute left-0 right-0 top-0 h-1.5 overflow-hidden rounded-t-md bg-budget">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${pct * 100}%`,
                          backgroundColor: over ? "var(--color-budget-over)" : "var(--color-budget-spent)",
                        }}
                      />
                      {over && (
                        <div
                          className="absolute right-0 top-0 h-full bg-budget-over/80"
                          style={{ width: `${Math.min(overPct * 100, 100)}%` }}
                        />
                      )}
                    </div>
                  )}

                  <div
                    className={`absolute left-0 right-0 overflow-hidden ${isSupplierBar ? "rounded-md border-2 border-dashed border-foreground/40" : "top-1.5 bottom-0 rounded-b-md border border-foreground/10"} cursor-grab active:cursor-grabbing`}
                    style={{
                      backgroundColor: isSupplierBar ? undefined : stage.color,
                      backgroundImage: supplierBg,
                      ...(isSupplierBar
                        ? { top: STAGE_ROW_H / 4, height: STAGE_ROW_H / 2 }
                        : {}),
                    }}
                    onPointerDown={(e) =>
                      startDrag(e, {
                        type: "stage-move",
                        id: stage.id,
                        projectId: stage.projectId,
                        startX: e.clientX,
                        origStart: stage.start_date,
                        origEnd: stage.end_date,
                      })
                    }
                  >
                    <div className="flex h-full min-w-0 items-center justify-between gap-2 px-2.5 text-foreground">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold leading-tight">{stage.name}</span>
                          <span className="rounded bg-background/40 px-1 py-px font-mono text-[9px]">
                            {workingDays(sStart, sEnd)}d
                          </span>
                          {isSupplierBar && Number(stage.budget ?? 0) > 0 && (
                            <span className="ml-auto shrink-0 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-sm">
                              {euros(Number(stage.budget))}
                            </span>
                          )}
                        </div>


                        {!isSupplierBar && (
                        <div className="mt-0 flex items-center gap-1.5 text-[10px] leading-tight opacity-80">
                          <span className="font-mono">{euros(totalCost)}</span>
                          <span>/</span>
                          <span className="font-mono">{euros(compareValue)}</span>
                          {features.planningMode && compareValue > 0 && (
                            <span className="rounded bg-background/40 px-1.5 py-px font-mono text-[10px]">
                              {Math.round((totalCost / compareValue) * 100)}%
                            </span>
                          )}
                          {displayHours > 0 && (
                            <span
                              className="rounded bg-background/40 px-1.5 py-px font-mono text-[10px]"
                              title={hoursAreImplied ? "Horas estimadas (orçamento / venda média/h)" : "Horas planeadas"}
                            >
                              {hoursAreImplied ? "≈" : ""}{Math.round(displayHours)}h
                            </span>
                          )}
                          {over && (
                            <span className="rounded bg-destructive px-1.5 py-px font-medium text-destructive-foreground">
                              {t("gantt.stage.overByAmount", { amount: euros(totalCost - compareValue) })}
                            </span>
                          )}
                          {showFinancials && budgetByStage?.get(stage.id) && (() => {
                            const bc = budgetByStage.get(stage.id)!;
                            const ouCls =
                              bc.projected_over_under < 0
                                ? "bg-destructive/80 text-destructive-foreground"
                                : bc.projected_over_under > 0
                                  ? "bg-emerald-600/70 text-white"
                                  : "bg-background/40";
                            return (
                              <span className="ml-1 inline-flex items-center gap-1.5 rounded bg-background/30 px-1.5 py-px font-mono">
                                <span title={t("gantt.stage.budgetBadge.remaining")}>
                                  R {euros(bc.remaining_budget)}
                                </span>
                                {bc.estimated_available_hours != null && (
                                  <span title={t("gantt.stage.budgetBadge.estHours")}>
                                    · ≈{Math.max(0, Math.round(bc.estimated_available_hours))}h
                                  </span>
                                )}
                                <span title={t("gantt.stage.budgetBadge.future")}>
                                  · F {euros(bc.planned_future_cost)}
                                </span>
                                <span
                                  className={`rounded px-1 ${ouCls}`}
                                  title={t("gantt.stage.budgetBadge.overUnder")}
                                >
                                  {bc.projected_over_under >= 0 ? "+" : ""}
                                  {euros(bc.projected_over_under)}
                                </span>
                              </span>
                            );
                          })()}
                        </div>
                        )}
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(t("gantt.stage.deleteConfirm", { name: stage.name }))) return;
                          await adapter.deleteStage({ id: stage.id, projectId: stage.projectId });
                        }}
                        className="shrink-0 rounded p-1 opacity-0 transition hover:bg-background/30 group-hover:opacity-100"
                        aria-label={t("gantt.stage.deleteAction")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className={`shrink-0 rounded p-1 transition hover:bg-background/30 ${features.planningMode ? "opacity-90" : "opacity-0 group-hover:opacity-100"}`}
                            aria-label={t("gantt.stage.financialsAction", { defaultValue: "Show financials" })}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          side="bottom"
                          className="w-64 text-xs"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <div className="mb-2 text-sm font-semibold">{stage.name}</div>
                          <div className="space-y-1.5">
                            {displayHours > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  {hoursAreImplied ? "Horas (estimadas)" : "Horas"}
                                </span>
                                <span className="font-mono">
                                  {hoursAreImplied ? "≈" : ""}{displayHours.toFixed(1)}h
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">{t("gantt.stage.fin.cost", { defaultValue: "Custo" })}</span>
                              <span className="font-mono">{euros(totalCost)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">{t("gantt.stage.fin.sale", { defaultValue: "Venda" })}</span>
                              <span className="font-mono">{euros(totalSale)}</span>
                            </div>
                            <div className="flex items-center justify-between border-t pt-1.5">
                              <span className="text-muted-foreground">{t("gantt.stage.fin.margin", { defaultValue: "Margem" })}</span>
                              <span className={`font-mono ${margin < 0 ? "text-destructive" : "text-emerald-600"}`}>
                                {euros(margin)}{" "}
                                <span className="text-[10px] text-muted-foreground">
                                  ({marginPct.toFixed(0)}%)
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center justify-between border-t pt-1.5">
                              <span className="text-muted-foreground">{t("gantt.stage.fin.budget", { defaultValue: "Orçamento" })}</span>
                              <span className="font-mono">{euros(budget)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">{t("gantt.stage.fin.vsBudget", { defaultValue: "vs Orçamento" })}</span>
                              <span className={`font-mono ${totalSale - budget < 0 ? "text-destructive" : "text-emerald-600"}`}>
                                {totalSale - budget >= 0 ? "+" : ""}
                                {euros(totalSale - budget)}
                              </span>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <StageDependencyEditor stage={stage} allStages={stages} adapter={adapter} />
                    </div>

                    <div
                      className="absolute left-0 top-0 z-10 h-full w-2.5 cursor-ew-resize bg-foreground/10 opacity-0 transition group-hover:opacity-100"
                      onPointerDown={(e) =>
                        startDrag(e, {
                          type: "stage-resize-l",
                          id: stage.id,
                          projectId: stage.projectId,
                          startX: e.clientX,
                          origStart: stage.start_date,
                          origEnd: stage.end_date,
                        })
                      }
                    />
                    <div
                      className="absolute right-0 top-0 z-10 h-full w-2.5 cursor-ew-resize bg-foreground/10 opacity-0 transition group-hover:opacity-100"
                      onPointerDown={(e) =>
                        startDrag(e, {
                          type: "stage-resize-r",
                          id: stage.id,
                          projectId: stage.projectId,
                          startX: e.clientX,
                          origStart: stage.start_date,
                          origEnd: stage.end_date,
                        })
                      }
                    />
                  </div>

                  <div
                    onPointerDown={(e) => startLinkDrag(e, stage.id, "start")}
                    className="absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-0 shadow transition group-hover:opacity-100"
                    style={{ left: 0 }}
                    title={t("gantt.stage.linkFromStart")}
                  />
                  <div
                    onPointerDown={(e) => startLinkDrag(e, stage.id, "end")}
                    className="absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-0 shadow transition group-hover:opacity-100"
                    style={{ left: stageW }}
                    title={t("gantt.stage.linkFromEnd")}
                  />
                </div>
                  );
                })()}

                {link && link.fromStageId !== stage.id && linkHoverStage === stage.id && link.toSide && (
                  <div
                    className="pointer-events-none absolute top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-primary/80 bg-primary/15"
                    style={{ left: link.toSide === "start" ? stageX : stageX + stageW, top: STAGE_ROW_H / 2 }}
                  />
                )}

                {!resHidden && stage.allocations.map((a, idx) => {
                  const aDraft = draftDates.get(a.id);
                  const aS = aDraft?.start ?? shiftIso(a.start_date, stageShiftDays);
                  const aE = aDraft?.end ?? shiftIso(a.end_date, stageShiftDays);
                  const aX = differenceInCalendarDays(new Date(aS), origin) * dayWidth;
                  const aW = dayCount(aS, aE) * dayWidth;
                  const costRate = effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override);
                  const cost = allocationCost({
                    start_date: aS,
                    end_date: aE,
                    hours_per_day: Number(a.hours_per_day),
                    hourly_rate: costRate,
                  });
                  const top = STAGE_ROW_H + idx * (ALLOC_ROW_H + 4);
                  const r = resourceMap.get(a.resource_id);
                  const color = r?.color ?? a.resource.color;
                  const durationDays = dayCount(a.start_date, a.end_date);
                  const overload = allocationOverload(
                    {
                      id: a.id,
                      resource_id: a.resource_id,
                      start_date: aS,
                      end_date: aE,
                      hours_per_day: Number(a.hours_per_day),
                    },
                    loadMap,
                    dailyLimitMap,
                  );
                  const resourceDailyHours = dailyHoursFor(a.resource_id, schedules);
                  const isOver = overload.peak > overload.limit;
                  const allocLeaveHours = leaveHoursInRange(
                    parseISO(aS),
                    parseISO(aE),
                    leaveByResource?.get(a.resource_id) ?? [],
                    holidaySet,
                    resourceDailyHours,
                  );
                  const hasLeave = allocLeaveHours > 0;
                  const allocTotalHours = workingDays(aS, aE) * Number(a.hours_per_day);
                  const reducedCapacity = Math.max(0, allocTotalHours - allocLeaveHours);
                  const isImported = a.is_locked === true || a.source === "imported_accelo";

                  return (
                    <div key={a.id} className="absolute group" style={{ left: aX, width: aW, top, height: ALLOC_ROW_H }}>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`relative h-full rounded-md border-l-4 bg-card shadow-sm transition ${
                                isImported
                                  ? "cursor-default border border-dashed border-muted-foreground/40 opacity-70"
                                  : "cursor-grab active:cursor-grabbing"
                              } ${isOver ? "ring-2 ring-destructive/70 bg-destructive/5" : ""}`}
                              style={{ borderLeftColor: color }}
                              onPointerDown={(e) => {
                                if (isImported) return;
                                startDrag(e, {
                                  type: "move",
                                  id: a.id,
                                  projectId: stage.projectId,
                                  startX: e.clientX,
                                  origStart: a.start_date,
                                  origEnd: a.end_date,
                                });
                              }}
                            >
                              <div className="flex h-full items-center justify-between gap-1 px-2 text-xs">
                                <div className="flex min-w-0 items-center gap-2">
                                  {!isImported && (
                                    <span
                                      draggable
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        e.dataTransfer.setData(
                                          "application/x-allocation",
                                          JSON.stringify({
                                            allocationId: a.id,
                                            fromProjectId: stage.projectId,
                                            durationDays,
                                          }),
                                        );
                                        e.dataTransfer.effectAllowed = "move";
                                      }}
                                      className="shrink-0 cursor-grab text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
                                      aria-label={t("gantt.stage.moveAllocation")}
                                    >
                                      <GripVertical className="h-3 w-3" />
                                    </span>
                                  )}
                                  <span className="shrink-0 -my-2 rounded-full ring-2 ring-background shadow-sm">
                                    <CollaboratorAvatar
                                      collaboratorId={a.resource.collaborator_id}
                                      name={a.resource.name}
                                      color={color}
                                      size={36}
                                    />
                                  </span>
                                  <span className="truncate font-medium">{a.resource.name}</span>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {Number(a.hours_per_day)}h/d
                                  </span>
                                  {isOver && (
                                    <span className="flex shrink-0 items-center gap-0.5 rounded bg-destructive px-1 py-px text-[10px] font-semibold text-destructive-foreground">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      {overload.peak}h
                                    </span>
                                  )}
                                  {hasLeave && (
                                    <span
                                      className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/20 px-1 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                                      title={t("gantt.tooltip.leaveOverlap", { hours: allocLeaveHours })}
                                    >
                                      <CalendarOff className="h-2.5 w-2.5" />
                                      −{allocLeaveHours}h
                                    </span>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                                  {showFinancials && budgetByAllocation?.get(a.id) && (() => {
                                    const ba = budgetByAllocation.get(a.id)!;
                                    return (
                                      <>
                                        {ba.actual_hours_logged > 0 && (
                                          <span
                                            className="rounded bg-foreground/10 px-1 py-px text-foreground/80"
                                            title={t("gantt.alloc.actualBadge")}
                                          >
                                            ✓ {Math.round(ba.actual_hours_logged)}h · {euros(ba.actual_cost_consumed)}
                                          </span>
                                        )}
                                        {ba.planned_future_hours > 0 && (
                                          <span
                                            className="rounded bg-primary/15 px-1 py-px text-foreground/80"
                                            title={t("gantt.alloc.futureBadge")}
                                          >
                                            → {Math.round(ba.planned_future_hours)}h · {euros(ba.planned_future_cost)}
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                  <span>{euros(cost)}</span>
                                </div>
                              </div>

                              {!isImported && (
                                <>
                                  <div
                                    className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize bg-foreground/10 opacity-0 transition group-hover:opacity-100"
                                    onPointerDown={(e) =>
                                      startDrag(e, {
                                        type: "resize-l",
                                        id: a.id,
                                        projectId: stage.projectId,
                                        startX: e.clientX,
                                        origStart: a.start_date,
                                        origEnd: a.end_date,
                                      })
                                    }
                                  />
                                  <div
                                    className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize bg-foreground/10 opacity-0 transition group-hover:opacity-100"
                                    onPointerDown={(e) =>
                                      startDrag(e, {
                                        type: "resize-r",
                                        id: a.id,
                                        projectId: stage.projectId,
                                        startX: e.clientX,
                                        origStart: a.start_date,
                                        origEnd: a.end_date,
                                      })
                                    }
                                  />
                                  <AllocationEditor allocation={a} projectId={stage.projectId} adapter={adapter} />
                                </>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-xs p-0">
                            <div className="space-y-1.5 p-2.5 text-xs">
                              <div className="flex items-center gap-2 border-b border-border/50 pb-1.5">
                                <CollaboratorAvatar
                                  collaboratorId={a.resource.collaborator_id}
                                  name={a.resource.name}
                                  color={color}
                                  size={24}
                                />
                                <span className="text-sm font-semibold">{a.resource.name}</span>
                                {a.resource.role && (
                                  <span className="text-[10px] text-muted-foreground">{a.resource.role}</span>
                                )}
                              </div>
                              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                <span className="text-muted-foreground">{t("gantt.tooltip.stage")}</span>
                                <span className="font-medium">{stage.name}</span>
                                <span className="text-muted-foreground">{t("gantt.tooltip.period")}</span>
                                <span className="font-mono">{fmt(aS)} → {fmt(aE)}</span>
                                <span className="text-muted-foreground">{t("gantt.tooltip.duration")}</span>
                                <span className="font-mono">{t("gantt.tooltip.workingDays", { count: workingDays(aS, aE) })}</span>
                                <span className="text-muted-foreground">{t("gantt.tooltip.effort")}</span>
                                <span className="font-mono">{t("gantt.tooltip.effortValue", { perDay: Number(a.hours_per_day), total: workingDays(aS, aE) * Number(a.hours_per_day) })}</span>
                                <span className="text-muted-foreground">{t("gantt.tooltip.costPerHour")}</span>
                                <span className="font-mono">{euros(costRate)}/h</span>
                                <span className="text-muted-foreground">{t("gantt.tooltip.totalCost")}</span>
                                <span className="font-mono font-semibold">{euros(cost)}</span>
                              </div>
                              {isOver && (
                                <div className="mt-1 flex items-start gap-1.5 rounded bg-destructive/10 p-1.5 text-[11px] text-destructive">
                                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span
                                    dangerouslySetInnerHTML={{
                                      __html: t("gantt.tooltip.overload", {
                                        peak: overload.peak,
                                        limit: overload.limit,
                                        days: overload.overDays,
                                      }),
                                    }}
                                  />
                                </div>
                              )}
                              {hasLeave && (
                                <div className="mt-1 flex items-start gap-1.5 rounded bg-amber-500/10 p-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                                  <CalendarOff className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span
                                    dangerouslySetInnerHTML={{
                                      __html: t("gantt.tooltip.leaveImpact", {
                                        leave: allocLeaveHours,
                                        effective: reducedCapacity,
                                        planned: allocTotalHours,
                                      }),
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <svg
          className="pointer-events-none absolute inset-0 z-10"
          width={totalDays * dayWidth}
          height="100%"
          style={{ overflow: "visible" }}
        >
          <defs>
            <marker id="dep-arrow-FS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
            </marker>
            <marker id="dep-arrow-SS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent-foreground)" />
            </marker>
            <marker id="dep-arrow-FF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted-foreground)" />
            </marker>
            <marker id="dep-arrow-SF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-destructive)" />
            </marker>
          </defs>
          {visibleDeps.map((d) => {
            const p = stageLayouts.get(d.predecessor_id)!;
            const s = stageLayouts.get(d.successor_id)!;
            const fromX = d.type === "FS" || d.type === "FF" ? p.x + p.w : p.x;
            const toX = d.type === "FS" || d.type === "SS" ? s.x : s.x + s.w;
            const fromY = p.anchorY;
            const toY = s.anchorY;
            // Exit predecessor on its anchor side; approach successor on its
            // anchor side. This guarantees the final segment direction (and
            // thus the arrowhead orientation) is always correct, even when
            // the source and target overlap horizontally.
            const exitX = d.type === "FS" || d.type === "FF" ? fromX + 12 : fromX - 12;
            const approachX = d.type === "FS" || d.type === "SS" ? toX - 12 : toX + 12;
            const midY = (fromY + toY) / 2;
            const path = `M ${fromX} ${fromY} L ${exitX} ${fromY} L ${exitX} ${midY} L ${approachX} ${midY} L ${approachX} ${toY} L ${toX} ${toY}`;
            const strokeColor =
              d.type === "FS"
                ? "var(--color-primary)"
                : d.type === "SS"
                ? "var(--color-accent-foreground)"
                : d.type === "FF"
                ? "var(--color-muted-foreground)"
                : "var(--color-destructive)";
            // Label at the horizontal mid-segment.
            const labelX = (exitX + approachX) / 2;
            const labelY = midY;
            const lagText =
              d.lag_days === 0
                ? ""
                : ` ${d.lag_days > 0 ? "+" : "−"}${Math.abs(d.lag_days)}d`;
            const label = `${d.type}${lagText}`;
            const labelWidth = 14 + label.length * 6;
            const beginEndpointDrag = (e: React.PointerEvent, which: "from" | "to") => {
              e.stopPropagation();
              e.preventDefault();
              const rect = canvasRef.current?.getBoundingClientRect();
              if (!rect) return;
              // Anchor the drag at the *other* endpoint; the side under the
              // pointer becomes the new target. Re-routing the "from" end
              // anchors at the successor, and vice versa.
              const anchorStageId = which === "from" ? d.successor_id : d.predecessor_id;
              const anchorSide: "start" | "end" =
                which === "from"
                  ? d.type === "FS" || d.type === "SS" ? "start" : "end"
                  : d.type === "FS" || d.type === "FF" ? "end" : "start";
              updateLink({
                fromStageId: anchorStageId,
                fromSide: anchorSide,
                pointerX: e.clientX - rect.left,
                pointerY: e.clientY - rect.top,
                toSide: null,
                direction: which === "from" ? "incoming" : "outgoing",
                replacesDepId: d.id,
              });
              const onUp = () => {
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
                commitLinkDrag();
              };
              window.addEventListener("pointerup", onUp);
              window.addEventListener("pointercancel", onUp);
            };
            return (
              <g key={d.id} style={{ pointerEvents: "auto" }}>
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  strokeOpacity={0.9}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  markerEnd={`url(#dep-arrow-${d.type})`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingDep({ id: d.id, x: labelX, y: labelY });
                  }}
                />
                {/* invisible wider hit area */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingDep({ id: d.id, x: labelX, y: labelY });
                  }}
                />
                {/* Endpoint handles — drag to re-anchor to a different stage / side. */}
                <circle
                  cx={fromX}
                  cy={fromY}
                  r={4}
                  fill="var(--color-background)"
                  stroke={strokeColor}
                  strokeWidth={2}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => beginEndpointDrag(e, "from")}
                />
                <circle
                  cx={toX}
                  cy={toY}
                  r={4}
                  fill={strokeColor}
                  stroke="var(--color-background)"
                  strokeWidth={2}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => beginEndpointDrag(e, "to")}
                />
                <g
                  transform={`translate(${labelX - labelWidth / 2}, ${labelY - 8})`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingDep({ id: d.id, x: labelX, y: labelY });
                  }}
                >
                  <rect
                    width={labelWidth}
                    height={16}
                    rx={3}
                    ry={3}
                    fill="var(--color-background)"
                    stroke={strokeColor}
                    strokeOpacity={0.6}
                    strokeWidth={1}
                  />
                  <text
                    x={labelWidth / 2}
                    y={11}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fill={strokeColor}
                    style={{ fontWeight: 600 }}
                  >
                    {label}
                  </text>
                </g>
              </g>
            );
          })}
          {link && (() => {
            const p = stageLayouts.get(link.fromStageId);
            if (!p) return null;
            const fromX = link.fromSide === "end" ? p.x + p.w : p.x;
            const fromY = p.anchorY;
            const previewType =
              linkHoverStage && link.toSide
                ? inferDepType(link.fromSide, link.toSide)
                : null;
            const target = linkHoverStage ? stageLayouts.get(linkHoverStage) : null;
            return (
              <g>
                <line
                  x1={fromX}
                  y1={fromY}
                  x2={link.pointerX}
                  y2={link.pointerY}
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  strokeOpacity={0.9}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                />
                {/* Snap dots on the hovered target showing both start/end
                    anchor points; the currently-selected side is filled. */}
                {target && link.toSide && (
                  <g>
                    <circle
                      cx={target.x}
                      cy={target.anchorY}
                      r={6}
                      fill={link.toSide === "start" ? "var(--color-primary)" : "var(--color-background)"}
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                    />
                    <circle
                      cx={target.x + target.w}
                      cy={target.anchorY}
                      r={6}
                      fill={link.toSide === "end" ? "var(--color-primary)" : "var(--color-background)"}
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                    />
                  </g>
                )}
                {previewType && (
                  <g transform={`translate(${link.pointerX + 12}, ${link.pointerY + 12})`}>
                    <rect
                      width={170}
                      height={18}
                      rx={3}
                      ry={3}
                      fill="var(--color-background)"
                      stroke="var(--color-primary)"
                      strokeOpacity={0.6}
                    />
                    <text
                      x={8}
                      y={12}
                      fontSize={10}
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                      fill="var(--color-foreground)"
                      style={{ fontWeight: 500 }}
                    >
                      {t("gantt.dependency.linkHint", { type: previewType })}
                    </text>
                  </g>
                )}
              </g>
            );
          })()}
        </svg>
        {editingDep && (() => {
          const dep = deps.find((x) => x.id === editingDep.id);
          if (!dep) return null;
          return (
            <>
              <div
                className="absolute inset-0 z-20"
                onClick={() => setEditingDep(null)}
              />
              <div
                className="absolute z-30 rounded-md border border-border bg-popover p-2 shadow-md"
                style={{ left: editingDep.x + 8, top: editingDep.y + 8 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  <Select
                    value={dep.type}
                    disabled={!adapter.updateDependency}
                    onValueChange={(v) => {
                      if (!adapter.updateDependency) return;
                      adapter
                        .updateDependency({ id: dep.id, patch: { type: v as DepType } })
                        .catch((err) => toast.error((err as Error).message));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["FS", "SS", "FF", "SF"] as DepType[]).map((tp) => (
                        <SelectItem key={tp} value={tp} className="text-xs">
                          {t(`gantt.dependency.typeDescriptions.${tp}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    defaultValue={dep.lag_days}
                    disabled={!adapter.updateDependency}
                    className="h-8 w-16 text-xs"
                    title={t("gantt.dependency.lagWorkingDays")}
                    onBlur={(e) => {
                      if (!adapter.updateDependency) return;
                      const v = Number(e.target.value) || 0;
                      if (v === dep.lag_days) return;
                      adapter
                        .updateDependency({ id: dep.id, patch: { lag_days: v } })
                        .catch((err) => toast.error((err as Error).message));
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      adapter
                        .deleteDependency(dep.id)
                        .then(() => setEditingDep(null))
                        .catch((err) => toast.error((err as Error).message));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
    </div>
  );
}
