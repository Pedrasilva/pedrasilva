import { addDays, format, parseISO, startOfWeek } from "date-fns";

export const PLAN_UTILISATION = 0.75;
export type DayPart = "am" | "pm";
export type BoardResource = { id: string; name: string; color: string | null; collaborator_id: string | null; weekly_capacity: number | null };
export type BoardProject = { id: string; name: string; client: string | null; color?: string | null };
export type BoardStage = { id: string; project_id: string; name: string; start_date: string; end_date: string; sort_order: number; parent_stage_id: string | null; stage_kind: string | null; is_milestone: boolean; is_self: boolean };
export type BoardAllocation = { id: string; resource_id: string; stage_id: string; project_id: string; start_date: string; end_date: string; hours_per_day: number; day_part: "full" | DayPart | null; is_site_visit: boolean; status: string; is_locked: boolean; source: string | null };
export type BoardLeave = { resource_id: string; day: string; kind: "leave" | "holiday"; name: string | null };
export type BoardData = { resources: BoardResource[]; projects: BoardProject[]; stages: BoardStage[]; allocations: BoardAllocation[]; leave: BoardLeave[]; plan: { id: string; status: string; approved_by: string | null; approved_at: string | null } | null; draft_slots: unknown[]; my_collaborator_id: string | null };
export type DerivedSlot = { projectId: string; stageId: string; isSiteVisit: boolean; inferred: boolean; status: string; allocationId: string };
export type DerivedDay = { am: DerivedSlot | null; pm: DerivedSlot | null; overload: DerivedSlot[]; otherHours: number; leave: BoardLeave | null };
export type DerivedBoard = Record<string, Record<string, DerivedDay>>;

export function mondayOf(date: Date | string): string {
  return format(startOfWeek(typeof date === "string" ? parseISO(date) : date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}
export function weekDays(week: string): string[] {
  return Array.from({ length: 5 }, (_, i) => format(addDays(parseISO(mondayOf(week)), i), "yyyy-MM-dd"));
}
export function dailyHours(resource: Pick<BoardResource, "weekly_capacity">): number {
  return resource.weekly_capacity && resource.weekly_capacity > 0 ? resource.weekly_capacity / 5 : 8;
}

/** Explicit halves first; legacy rows fill remaining halves largest-first. No writes. */
export function deriveSlots(allocations: BoardAllocation[], week: string, dailyHoursByResource: Record<string, number>, leave: BoardLeave[]): DerivedBoard {
  const result: DerivedBoard = {};
  const days = weekDays(week);
  for (const resourceId of Object.keys(dailyHoursByResource)) {
    result[resourceId] = {};
    for (const day of days) {
      const cell: DerivedDay = { am: null, pm: null, overload: [], otherHours: 0, leave: leave.find(l => l.resource_id === resourceId && l.day === day) ?? null };
      result[resourceId][day] = cell;
      if (cell.leave) continue;
      const rows = allocations.filter(a => a.resource_id === resourceId && a.start_date <= day && a.end_date >= day)
        .sort((a, b) => Number(b.day_part !== null) - Number(a.day_part !== null) || Number(b.hours_per_day) - Number(a.hours_per_day) || a.id.localeCompare(b.id));
      for (const a of rows) {
        const slot: DerivedSlot = { projectId: a.project_id, stageId: a.stage_id, isSiteVisit: a.is_site_visit, inferred: a.day_part === null, status: a.status, allocationId: a.id };
        let parts: DayPart[];
        if (a.day_part === "full") parts = ["am", "pm"];
        else if (a.day_part) parts = [a.day_part];
        else {
          const ratio = Number(a.hours_per_day) / ((dailyHoursByResource[resourceId] || 8) * PLAN_UTILISATION);
          if (ratio < 0.25) { cell.otherHours += Number(a.hours_per_day); continue; }
          const free: DayPart = cell.am ? "pm" : "am";
          parts = ratio >= 0.75 ? ["am", "pm"] : [free];
        }
        let overflow = false;
        for (const part of parts) {
          if (cell[part]) overflow = true;
          else cell[part] = slot;
        }
        if (overflow) cell.overload.push(slot);
      }
    }
  }
  return result;
}

export function resourceSlotCounts(days: Record<string, DerivedDay>) {
  const available = Object.values(days).filter(d => !d.leave).length * 2;
  const booked = Object.values(days).reduce((sum, d) => sum + Number(!!d.am) + Number(!!d.pm), 0);
  return { available, booked, free: available - booked };
}