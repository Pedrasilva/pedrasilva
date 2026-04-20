import { useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, isSameMonth, isWeekend, startOfWeek } from "date-fns";
import type { Resource, StageWithAllocations } from "@/lib/projects/types";
import { allocationCost, dayCount, euros, workingDays } from "@/lib/projects/gantt-utils";
import { useDefaultResourceRates, effectiveCostRate } from "@/lib/projects/use-default-rates";
import {
  useCreateAllocation,
  useUpdateAllocation,
  useUpdateStageWithCascade,
  useDeleteStage,
  useStageDependencies,
  useCreateDependency,
} from "@/lib/projects/use-planner";
import { AllocationEditor } from "@/components/projects/allocation-editor";
import { StageDependencyEditor } from "@/components/projects/stage-dependency-editor";
import { toast } from "sonner";
import { Trash2, GripVertical, AlertTriangle } from "lucide-react";
import { allocationOverload, buildLoadMap, DAILY_LIMIT_HOURS } from "@/lib/projects/overload";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmt } from "@/lib/projects/gantt-utils";

export type StageWithProject = StageWithAllocations & { projectId: string };

interface Props {
  projectId?: string;
  stages: StageWithProject[];
  origin: Date;
  totalDays: number;
  dayWidth: number;
  resources: Resource[];
  embedded?: boolean;
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
}

export function GanttChart({ stages, origin, totalDays, dayWidth, resources }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draftDates, setDraftDates] = useState<Map<string, { start: string; end: string }>>(new Map());
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const [link, setLink] = useState<LinkDragState | null>(null);
  const [linkHoverStage, setLinkHoverStage] = useState<string | null>(null);

  const updateAlloc = useUpdateAllocation();
  const updateStageCascade = useUpdateStageWithCascade();
  const deleteStage = useDeleteStage();
  const createAlloc = useCreateAllocation();
  const createDep = useCreateDependency();
  const { data: deps } = useStageDependencies();
  const { data: defaultRates } = useDefaultResourceRates();

  const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

  const loadMap = useMemo(() => {
    const flat = stages.flatMap((s) =>
      s.allocations.map((a) => {
        const draft = draftDates.get(a.id);
        return {
          id: a.id,
          resource_id: a.resource_id,
          start_date: draft?.start ?? a.start_date,
          end_date: draft?.end ?? a.end_date,
          hours_per_day: Number(a.hours_per_day),
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
        out.push({ label: format(cur, "MMMM yyyy"), days: count + 1, startIdx });
        cur = d;
        startIdx = i;
        count = 0;
      } else {
        count++;
      }
    });
    out.push({ label: format(cur, "MMMM yyyy"), days: count + 1, startIdx });
    return out;
  }, [origin, totalDays]);

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
        setLink({ ...link, pointerX: px, pointerY: py });
        let hit: string | null = null;
        for (const [sid, geo] of stageLayouts.entries()) {
          if (sid === link.fromStageId) continue;
          if (px >= geo.x && px <= geo.x + geo.w && py >= geo.top && py <= geo.top + STAGE_ROW_H) {
            hit = sid;
            break;
          }
        }
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
    setLink({ fromStageId, fromSide, pointerX: e.clientX - rect.left, pointerY: e.clientY - rect.top });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function commitLinkDrag() {
    if (!link) return;
    const target = linkHoverStage;
    setLink(null);
    setLinkHoverStage(null);
    if (!target || target === link.fromStageId) return;
    const type = link.fromSide === "end" ? "FS" : "SS";
    createDep
      .mutateAsync({ predecessor_id: link.fromStageId, successor_id: target, type, lag_days: 0 })
      .then(() => toast.success("Ligação criada"))
      .catch((err) => toast.error((err as Error).message));
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
        await updateStageCascade.mutateAsync({
          id: drag.id,
          projectId: drag.projectId,
          start_date: draft.start,
          end_date: draft.end,
        });
      } else {
        await updateAlloc.mutateAsync({
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
        const stageEnd = new Date(stage.end_date);
        let endCandidate = addDays(addDays(origin, dropDayOffset), Math.max(0, parsed.durationDays - 1));
        if (endCandidate > stageEnd) endCandidate = stageEnd;
        const endDate = format(endCandidate, "yyyy-MM-dd");
        updateAlloc
          .mutateAsync({
            id: parsed.allocationId,
            projectId: parsed.fromProjectId,
            patch: { stage_id: stage.id, start_date: startDate, end_date: endDate },
          })
          .then(() => toast.success("Allocation moved"))
          .catch((err) => toast.error((err as Error).message));
      } catch (err) {
        toast.error((err as Error).message);
      }
      return;
    }

    const stageEnd = new Date(stage.end_date);
    let endCandidate = addDays(addDays(origin, dropDayOffset), 4);
    if (endCandidate > stageEnd) endCandidate = stageEnd;
    const endDate = format(endCandidate, "yyyy-MM-dd");

    createAlloc
      .mutateAsync({
        stage_id: stage.id,
        resource_id: resourceId,
        start_date: startDate,
        end_date: endDate,
        hours_per_day: 6,
        projectId: stage.projectId,
      })
      .then(() => toast.success("Resource allocated"))
      .catch((err) => toast.error((err as Error).message));
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
        <div className="flex h-9">
          {Array.from({ length: totalDays }).map((_, i) => {
            const d = addDays(origin, i);
            const isWeek = isWeekend(d);
            const isMonStart = startOfWeek(d, { weekStartsOn: 1 }).getDate() === d.getDate();
            const isToday = differenceInCalendarDays(d, today) === 0;
            const weekday = format(d, "EEEEE");
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

            let totalCost = 0;
            for (const a of stage.allocations) {
              const aDraft = draftDates.get(a.id);
              const aS = aDraft?.start ?? a.start_date;
              const aE = aDraft?.end ?? a.end_date;
              totalCost += allocationCost({
                start_date: aS,
                end_date: aE,
                hours_per_day: Number(a.hours_per_day),
                hourly_rate: Number(a.resource.hourly_rate),
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
                              over by {euros(totalCost - budget)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete stage "${stage.name}"?`)) return;
                          await deleteStage.mutateAsync({ id: stage.id, projectId: stage.projectId });
                        }}
                        className="rounded p-1 opacity-0 transition hover:bg-background/30 group-hover:opacity-100"
                        aria-label="Delete stage"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <StageDependencyEditor stage={stage} allStages={stages} />
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
                    title="Arraste para outra fase para criar dependência (a partir do início)"
                  />
                  <div
                    onPointerDown={(e) => startLinkDrag(e, stage.id, "end")}
                    className="absolute -right-3 top-1/2 z-30 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary opacity-0 shadow transition group-hover:opacity-100"
                    title="Arraste para outra fase para criar dependência (a partir do fim)"
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
                  const aS = aDraft?.start ?? a.start_date;
                  const aE = aDraft?.end ?? a.end_date;
                  const aX = differenceInCalendarDays(new Date(aS), origin) * dayWidth;
                  const aW = dayCount(aS, aE) * dayWidth;
                  const cost = allocationCost({
                    start_date: aS,
                    end_date: aE,
                    hours_per_day: Number(a.hours_per_day),
                    hourly_rate: Number(a.resource.hourly_rate),
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
                  );
                  const isOver = overload.peak > DAILY_LIMIT_HOURS;

                  return (
                    <div key={a.id} className="absolute group" style={{ left: aX, width: aW, top, height: ALLOC_ROW_H }}>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`relative h-full cursor-grab rounded-md border-l-4 bg-card shadow-sm transition active:cursor-grabbing ${
                                isOver ? "ring-2 ring-destructive/70 bg-destructive/5" : ""
                              }`}
                              style={{ borderLeftColor: color }}
                              onPointerDown={(e) =>
                                startDrag(e, {
                                  type: "move",
                                  id: a.id,
                                  projectId: stage.projectId,
                                  startX: e.clientX,
                                  origStart: a.start_date,
                                  origEnd: a.end_date,
                                })
                              }
                            >
                              <div className="flex h-full items-center justify-between gap-1 overflow-hidden px-2 text-xs">
                                <div className="flex min-w-0 items-center gap-2">
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
                                    aria-label="Move allocation"
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </span>
                                  <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
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
                                </div>
                                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                  {euros(cost)}
                                </span>
                              </div>

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
                              <AllocationEditor allocation={a} projectId={stage.projectId} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-xs p-0">
                            <div className="space-y-1.5 p-2.5 text-xs">
                              <div className="flex items-center gap-2 border-b border-border/50 pb-1.5">
                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="font-display text-sm font-semibold">{a.resource.name}</span>
                                {a.resource.role && (
                                  <span className="text-[10px] text-muted-foreground">{a.resource.role}</span>
                                )}
                              </div>
                              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                <span className="text-muted-foreground">Fase</span>
                                <span className="font-medium">{stage.name}</span>
                                <span className="text-muted-foreground">Período</span>
                                <span className="font-mono">{fmt(aS)} → {fmt(aE)}</span>
                                <span className="text-muted-foreground">Duração</span>
                                <span className="font-mono">{workingDays(aS, aE)} dias úteis</span>
                                <span className="text-muted-foreground">Esforço</span>
                                <span className="font-mono">{Number(a.hours_per_day)}h/dia · {workingDays(aS, aE) * Number(a.hours_per_day)}h total</span>
                                <span className="text-muted-foreground">Tarifa</span>
                                <span className="font-mono">{euros(Number(a.resource.hourly_rate))}/h</span>
                                <span className="text-muted-foreground">Custo</span>
                                <span className="font-mono font-semibold">{euros(cost)}</span>
                              </div>
                              {isOver && (
                                <div className="mt-1 flex items-start gap-1.5 rounded bg-destructive/10 p-1.5 text-[11px] text-destructive">
                                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span>
                                    Sobrecarga: pico de <strong>{overload.peak}h/dia</strong> (limite {DAILY_LIMIT_HOURS}h) em {overload.overDays} dia(s).
                                  </span>
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
            <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
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
            return (
              <path key={d.id} d={path} fill="none" stroke="var(--color-primary)" strokeWidth={1.5} strokeOpacity={0.7} markerEnd="url(#dep-arrow)" />
            );
          })}
          {link && (() => {
            const p = stageLayouts.get(link.fromStageId);
            if (!p) return null;
            const fromX = link.fromSide === "end" ? p.x + p.w : p.x;
            const fromY = p.top + STAGE_ROW_H / 2;
            return (
              <line x1={fromX} y1={fromY} x2={link.pointerX} y2={link.pointerY} stroke="var(--color-primary)" strokeWidth={1.5} strokeDasharray="4 3" />
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
