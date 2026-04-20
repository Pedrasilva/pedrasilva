import { addDays, format, isWeekend, parseISO } from "date-fns";

export const DAILY_LIMIT_HOURS = 8;

export interface AllocationLite {
  id: string;
  resource_id: string;
  start_date: string;
  end_date: string;
  hours_per_day: number;
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

export function overloadedAllocationIds(allocations: AllocationLite[]): Set<string> {
  const load = buildLoadMap(allocations);
  const bad = new Set<string>();
  for (const a of allocations) {
    let d = parseISO(a.start_date);
    const end = parseISO(a.end_date);
    while (d <= end) {
      if (!isWeekend(d)) {
        const key = `${a.resource_id}|${format(d, "yyyy-MM-dd")}`;
        if ((load.get(key) ?? 0) > DAILY_LIMIT_HOURS) {
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
): { peak: number; overDays: number } {
  let peak = 0;
  let overDays = 0;
  let d = parseISO(allocation.start_date);
  const end = parseISO(allocation.end_date);
  while (d <= end) {
    if (!isWeekend(d)) {
      const key = `${allocation.resource_id}|${format(d, "yyyy-MM-dd")}`;
      const total = load.get(key) ?? 0;
      if (total > peak) peak = total;
      if (total > DAILY_LIMIT_HOURS) overDays += 1;
    }
    d = addDays(d, 1);
  }
  return { peak, overDays };
}
