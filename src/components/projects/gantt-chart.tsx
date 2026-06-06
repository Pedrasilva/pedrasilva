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
  /** Payment milestones to render in the lane above the stage rows. */
  milestones?: PaymentMilestone[];
}

const STAGE_ROW_H = 92;
const ALLOC_ROW_H = 32;
const STAGE_GAP = 16;

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
}

export function GanttChart({ stages, origin, totalDays, dayWidth, resources, adapter, budgetByStage, budgetByAllocation, showFinancials }: Props) {
  const { t } = useTranslation("projects");
  const dateLocale = useDateLocale();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draftDates, setDraftDates] = useState<Map<string, { start: string; end: string }>>(new Map());
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const [link, setLink] = useState<LinkDragState | null>(null);
  const [linkHoverStage, setLinkHoverStage] = useState<string | null>(null);
  const [editingDep, setEditingDep] = useState<{ id: string; x: number; y: number } | null>(null);

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
    const out = new Map<string, { top: number; height: number; x: number; w: number }>();
    let cursor = 16;
    stages.forEach((stage, i) => {
      const draft = draftDates.get(stage.id);
      const sStart = draft?.start ?? stage.start_date;
      const sEnd = draft?.end ?? stage.end_date;
      const x = differenceInCalendarDays(new Date(sStart), origin) * dayWidth;
      const w = dayCount(sStart, sEnd) * dayWidth;
      const allocRows = Math.max(stage.allocations.length, 0);
      const rowsHeight = allocRows * (ALLOC_ROW_H + 4);
      const height = STAGE_ROW_H + rowsHeight + STAGE_GAP;
      if (i > 0) cursor += 16;
      out.set(stage.id, { top: cursor, height, x, w });
      cursor += height;
    });
    return out;
  }, [stages, draftDates, origin, dayWidth]);

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
        for (const [sid, geo] of stageLayouts.entries()) {
          if (sid === link.fromStageId) continue;
          if (px >= geo.x && px <= geo.x + geo.w && py >= geo.top && py <= geo.top + STAGE_ROW_H) {
            hit = sid;
            // Classify which half of the bar the pointer is over.
            // Left third = start, right third = end, middle = nearest side.
            const rel = (px - geo.x) / geo.w;
            toSide = rel < 0.5 ? "start" : "end";
            break;
          }
        }
        setLink({ ...link, pointerX: px, pointerY: py, toSide });
        setLinkHoverStage(hit);
      }
    }
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const days = Math.round(dx / dayWidth);
    if (days === 0) {
      setDraftDates((m) => {
        const next = new Map(m);
        next.delete(drag.id);
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
    setDraftDates((m) => new Map(m).set(drag.id, { start: newStart, end: newEnd }));
  }

  function startLinkDrag(e: React.PointerEvent, fromStageId: string, fromSide: "start" | "end") {
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setLink({
      fromStageId,
      fromSide,
      pointerX: e.clientX - rect.left,
      pointerY: e.clientY - rect.top,
      toSide: null,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
    if (!link) return;
    const target = linkHoverStage;
    const toSide = link.toSide;
    setLink(null);
    setLinkHoverStage(null);
    if (!target || target === link.fromStageId || !toSide) return;
    const type = inferDepType(link.fromSide, toSide);
    adapter
      .createDependency({ predecessor_id: link.fromStageId, successor_id: target, type, lag_days: 0 })
      .then(() => toast.success(t("gantt.toasts.linkCreated")))
      .catch((err: unknown) => toast.error((err as Error).message));
  }

  async function commitDrag() {
    if (!drag) return;
    const draft = draftDates.get(drag.id);
    setDrag(null);
    if (!draft) return;
    setDraftDates((m) => {
      const next = new Map(m);
      next.delete(drag.id);
      return next;
    });
    try {
      if (drag.type.startsWith("stage")) {
        await adapter.updateStage({
          id: drag.id,
          projectId: drag.projectId,
          start_date: draft.start,
          end_date: draft.end,
        });
      } else {
        await adapter.updateAllocation({
          id: drag.id,
          projectId: drag.projectId,
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

    const stageEnd = new Date(stage.end_date);
    let endCandidate = addDays(addDays(origin, dropDayOffset), 4);
    if (endCandidate > stageEnd) endCandidate = stageEnd;
    const endDate = format(endCandidate, "yyyy-MM-dd");

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

  return (
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
          {months.map((m, i) => (
            <div
              key={i}
              className="flex items-center border-l border-border/40 px-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/80 first:border-l-0"
              style={{ width: m.days * dayWidth, minWidth: m.days * dayWidth }}
            >
              {m.label}
            </div>
          ))}
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

      <div className="relative gantt-canvas-bg gantt-week-marker" style={{ minHeight: stages.length * 200 }}>
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
            for (const a of stage.allocations) {
              const aDraft = draftDates.get(a.id);
              const aS = aDraft?.start ?? shiftIso(a.start_date, stageShiftDays);
              const aE = aDraft?.end ?? shiftIso(a.end_date, stageShiftDays);
              totalCost += allocationCost({
                start_date: aS,
                end_date: aE,
                hours_per_day: Number(a.hours_per_day),
                hourly_rate: effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override),
              });
            }
            const budget = Number(stage.budget);
            const pct = budget > 0 ? Math.min(1, totalCost / budget) : 0;
            const overPct = budget > 0 ? Math.max(0, totalCost / budget - 1) : 0;
            const over = totalCost > budget;
            const allocRows = Math.max(stage.allocations.length, 0);
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

                <div className="group absolute" style={{ left: stageX, width: stageW, top: 0, height: STAGE_ROW_H }}>
                  <div className="absolute left-0 right-0 top-0 h-3 overflow-hidden rounded-t-md bg-budget">
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

                  <div
                    className="absolute left-0 right-0 top-3 bottom-0 cursor-grab rounded-b-md border border-foreground/10 active:cursor-grabbing"
                    style={{ backgroundColor: stage.color }}
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
                    <div className="flex h-full items-center justify-between px-3 text-foreground">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-display text-base font-semibold">{stage.name}</span>
                          <span className="rounded bg-background/40 px-1.5 py-0.5 font-mono text-[10px]">
                            {workingDays(sStart, sEnd)}d
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] opacity-80">
                          <span className="font-mono">{euros(totalCost)}</span>
                          <span>/</span>
                          <span className="font-mono">{euros(budget)}</span>
                          {over && (
                            <span className="rounded bg-destructive px-1.5 py-px font-medium text-destructive-foreground">
                              {t("gantt.stage.overByAmount", { amount: euros(totalCost - budget) })}
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
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(t("gantt.stage.deleteConfirm", { name: stage.name }))) return;
                          await adapter.deleteStage({ id: stage.id, projectId: stage.projectId });
                        }}
                        className="rounded p-1 opacity-0 transition hover:bg-background/30 group-hover:opacity-100"
                        aria-label={t("gantt.stage.deleteAction")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
                    className="absolute -left-3 top-1/2 z-30 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-0 shadow transition group-hover:opacity-100"
                    title={t("gantt.stage.linkFromStart")}
                  />
                  <div
                    onPointerDown={(e) => startLinkDrag(e, stage.id, "end")}
                    className="absolute -right-3 top-1/2 z-30 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-0 shadow transition group-hover:opacity-100"
                    title={t("gantt.stage.linkFromEnd")}
                  />
                </div>

                {link && link.fromStageId !== stage.id && linkHoverStage === stage.id && (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-20 rounded-md ring-2 ring-primary/70 bg-primary/10"
                    style={{ height: STAGE_ROW_H, left: stageX, width: stageW }}
                  />
                )}

                {stage.allocations.map((a, idx) => {
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
                                <span className="font-display text-sm font-semibold">{a.resource.name}</span>
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
            <marker id="dep-arrow-FS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
            </marker>
            <marker id="dep-arrow-SS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent-foreground)" />
            </marker>
            <marker id="dep-arrow-FF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted-foreground)" />
            </marker>
            <marker id="dep-arrow-SF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-destructive)" />
            </marker>
          </defs>
          {visibleDeps.map((d) => {
            const p = stageLayouts.get(d.predecessor_id)!;
            const s = stageLayouts.get(d.successor_id)!;
            const fromX = d.type === "FS" || d.type === "FF" ? p.x + p.w : p.x;
            const toX = d.type === "FS" || d.type === "SF" ? s.x : s.x + s.w;
            const fromY = p.top + STAGE_ROW_H / 2;
            const toY = s.top + STAGE_ROW_H / 2;
            const dx = toX > fromX ? 10 : -10;
            const path = `M ${fromX} ${fromY} L ${fromX + dx} ${fromY} L ${fromX + dx} ${toY} L ${toX} ${toY}`;
            const strokeColor =
              d.type === "FS"
                ? "var(--color-primary)"
                : d.type === "SS"
                ? "var(--color-accent-foreground)"
                : d.type === "FF"
                ? "var(--color-muted-foreground)"
                : "var(--color-destructive)";
            // Label at the elbow midpoint along the vertical segment.
            const labelX = fromX + dx;
            const labelY = (fromY + toY) / 2;
            const lagText =
              d.lag_days === 0
                ? ""
                : ` ${d.lag_days > 0 ? "+" : "−"}${Math.abs(d.lag_days)}d`;
            const label = `${d.type}${lagText}`;
            const labelWidth = 14 + label.length * 6;
            return (
              <g
                key={d.id}
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingDep({ id: d.id, x: labelX, y: labelY });
                }}
              >
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.75}
                  markerEnd={`url(#dep-arrow-${d.type})`}
                />
                {/* invisible wider hit area */}
                <path d={path} fill="none" stroke="transparent" strokeWidth={10} />
                <g transform={`translate(${labelX - labelWidth / 2}, ${labelY - 8})`}>
                  <rect
                    width={labelWidth}
                    height={16}
                    rx={3}
                    ry={3}
                    fill="var(--color-background)"
                    stroke={strokeColor}
                    strokeOpacity={0.5}
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
            const fromY = p.top + STAGE_ROW_H / 2;
            const previewType =
              linkHoverStage && link.toSide
                ? inferDepType(link.fromSide, link.toSide)
                : null;
            return (
              <g>
                <line
                  x1={fromX}
                  y1={fromY}
                  x2={link.pointerX}
                  y2={link.pointerY}
                  stroke="var(--color-primary)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
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
  );
}
