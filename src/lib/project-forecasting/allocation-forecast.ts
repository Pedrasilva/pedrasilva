/**
 * Stage 6C — Daily allocation forecast distribution.
 *
 * Takes pm_allocations rows (real, manual allocations) and distributes
 * `hours_per_day` across business days between start_date and end_date.
 *
 * Pure: same input → same output. No DB writes.
 */
import { addDays, format, isWeekend, parseISO } from "date-fns";
import type {
  AllocationRow,
  DailyForecastPoint,
  ResourceRow,
  StageRow,
} from "./types";

export interface DistributeOptions {
  /** Skip Saturdays/Sundays. Default true. */
  excludeWeekends?: boolean;
  /** Clamp to this window (inclusive). */
  windowStart?: string;
  windowEnd?: string;
}

export function distributeAllocationToDaily(
  alloc: AllocationRow,
  stage: StageRow,
  resource: ResourceRow | undefined,
  opts: DistributeOptions = {},
): DailyForecastPoint[] {
  const excludeWeekends = opts.excludeWeekends !== false;

  const start = parseISO(alloc.start_date);
  const end = parseISO(alloc.end_date);
  const winStart = opts.windowStart ? parseISO(opts.windowStart) : null;
  const winEnd = opts.windowEnd ? parseISO(opts.windowEnd) : null;

  if (end < start) return [];

  const hoursPerDay = Number(alloc.hours_per_day) || 0;
  if (hoursPerDay <= 0) return [];

  const out: DailyForecastPoint[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (excludeWeekends && isWeekend(d)) continue;
    if (winStart && d < winStart) continue;
    if (winEnd && d > winEnd) continue;

    out.push({
      project_id: stage.project_id,
      project_stage_id: stage.id,
      allocation_id: alloc.id,
      resource_id: alloc.resource_id,
      collaborator_id: resource?.collaborator_id ?? null,
      allocation_date: format(d, "yyyy-MM-dd"),
      allocated_hours: hoursPerDay,
    });
  }
  return out;
}

export function distributeAllAllocations(
  allocations: AllocationRow[],
  stagesById: Map<string, StageRow>,
  resourcesById: Map<string, ResourceRow>,
  opts: DistributeOptions = {},
): DailyForecastPoint[] {
  const out: DailyForecastPoint[] = [];
  for (const a of allocations) {
    const stage = stagesById.get(a.stage_id);
    if (!stage) continue;
    out.push(
      ...distributeAllocationToDaily(a, stage, resourcesById.get(a.resource_id), opts),
    );
  }
  return out;
}

/** Sum daily forecast points per stage. */
export function totalAllocatedHoursByStage(
  daily: DailyForecastPoint[],
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const d of daily) {
    acc.set(d.project_stage_id, (acc.get(d.project_stage_id) ?? 0) + d.allocated_hours);
  }
  return acc;
}

/** Sum daily forecast points per collaborator/resource. */
export function totalAllocatedHoursByResource(
  daily: DailyForecastPoint[],
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const d of daily) {
    acc.set(d.resource_id, (acc.get(d.resource_id) ?? 0) + d.allocated_hours);
  }
  return acc;
}
