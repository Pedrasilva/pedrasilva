import { addDays, differenceInCalendarDays, format, isWeekend, parseISO, startOfDay } from "date-fns";

export const DAY_WIDTH = 32;
export const ROW_HEIGHT = 56;

export function toDate(d: string | Date): Date {
  return typeof d === "string" ? parseISO(d) : d;
}

export function dayCount(start: string | Date, end: string | Date): number {
  return Math.max(1, differenceInCalendarDays(toDate(end), toDate(start)) + 1);
}

export function workingDays(start: string | Date, end: string | Date): number {
  const s = startOfDay(toDate(start));
  const e = startOfDay(toDate(end));
  let count = 0;
  let d = s;
  while (d <= e) {
    if (!isWeekend(d)) count++;
    d = addDays(d, 1);
  }
  return Math.max(0, count);
}

export function dateToX(date: string | Date, origin: Date, dayWidth = DAY_WIDTH): number {
  return differenceInCalendarDays(toDate(date), origin) * dayWidth;
}

export function xToDate(x: number, origin: Date, dayWidth = DAY_WIDTH): Date {
  return addDays(origin, Math.round(x / dayWidth));
}

export function fmt(d: string | Date): string {
  return format(toDate(d), "MMM d");
}

export function fmtShort(d: string | Date): string {
  return format(toDate(d), "d");
}

export function fmtMonth(d: string | Date): string {
  return format(toDate(d), "MMM yyyy");
}

export function euros(n: number): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export interface AllocationLite {
  start_date: string;
  end_date: string;
  hours_per_day: number;
  hourly_rate: number;
}

export function allocationCost(a: AllocationLite): number {
  return workingDays(a.start_date, a.end_date) * a.hours_per_day * a.hourly_rate;
}

export function allocationHours(a: Pick<AllocationLite, "start_date" | "end_date" | "hours_per_day">): number {
  return workingDays(a.start_date, a.end_date) * a.hours_per_day;
}
