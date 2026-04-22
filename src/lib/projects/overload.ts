import { addDays, format, isWeekend, parseISO } from "date-fns";

/**
 * Fallback only used when no per-resource schedule is provided (e.g. resource
 * not linked to an HR collaborator). Real values come from
 * `collaborators.daily_hours` via `useResourceSchedules`.
 */
export const DEFAULT_DAILY_LIMIT_HOURS = 8;

/**
 * Per-resource overload thresholds. Map of resource_id → daily limit (hours).
 * Resources not in the map fall back to `DEFAULT_DAILY_LIMIT_HOURS`.
 */
export type DailyLimitMap = Map<string, number>;

export interface AllocationLite {
  id: string;
  resource_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number;
}

function limitFor(resourceId: string, limits?: DailyLimitMap): number {
  return limits?.get(resourceId) ?? DEFAULT_DAILY_LIMIT_HOURS;
}

export function buildLoadMap(allocations: AllocationLite[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const a of allocations) {
    let d = parseISO(a.start_date);
    const end = parseISO(a.end_date);
    while (d <= end) {
      if (!isWeekend(d)) {
        const key = `${a.resource_id}|${format(d, "yyyy-MM-dd")}`;
        load.set(key, (load.get(key) ?? 0) + Number(a.hours_per_day));
      }
      d = addDays(d, 1);
    }
  }
  return load;
}

export function overloadedAllocationIds(
  allocations: AllocationLite[],
  limits?: DailyLimitMap,
): Set<string> {
  const load = buildLoadMap(allocations);
  const bad = new Set<string>();
  for (const a of allocations) {
    const cap = limitFor(a.resource_id, limits);
    let d = parseISO(a.start_date);
    const end = parseISO(a.end_date);
    while (d <= end) {
      if (!isWeekend(d)) {
        const key = `${a.resource_id}|${format(d, "yyyy-MM-dd")}`;
        if ((load.get(key) ?? 0) > cap) {
          bad.add(a.id);
          break;
        }
      }
      d = addDays(d, 1);
    }
  }
  return bad;
}

export function allocationOverload(
  allocation: AllocationLite,
  load: Map<string, number>,
  limits?: DailyLimitMap,
): { peak: number; overDays: number; limit: number } {
  const limit = limitFor(allocation.resource_id, limits);
  let peak = 0;
  let overDays = 0;
  let d = parseISO(allocation.start_date);
  const end = parseISO(allocation.end_date);
  while (d <= end) {
    if (!isWeekend(d)) {
      const key = `${allocation.resource_id}|${format(d, "yyyy-MM-dd")}`;
      const total = load.get(key) ?? 0;
      if (total > peak) peak = total;
      if (total > limit) overDays += 1;
    }
    d = addDays(d, 1);
  }
  return { peak, overDays, limit };
}
