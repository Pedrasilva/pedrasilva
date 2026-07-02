import { addDays, format, isWeekend, parseISO } from "date-fns";

/**
 * Working-day = Mon-Fri and not a public holiday (from PT holidays table).
 * Used to snap dragged / newly-created stage & allocation dates so that
 * a stage never starts on a weekend or a public holiday.
 */
export function isWorkingDay(iso: string, holidays?: Set<string> | null): boolean {
  const d = parseISO(iso);
  if (isWeekend(d)) return false;
  if (holidays && holidays.has(iso)) return false;
  return true;
}

export function snapToWorkdayForward(
  iso: string,
  holidays?: Set<string> | null,
): string {
  let d = parseISO(iso);
  for (let i = 0; i < 21; i++) {
    const s = format(d, "yyyy-MM-dd");
    if (isWorkingDay(s, holidays)) return s;
    d = addDays(d, 1);
  }
  return iso;
}

export function snapToWorkdayBackward(
  iso: string,
  holidays?: Set<string> | null,
): string {
  let d = parseISO(iso);
  for (let i = 0; i < 21; i++) {
    const s = format(d, "yyyy-MM-dd");
    if (isWorkingDay(s, holidays)) return s;
    d = addDays(d, -1);
  }
  return iso;
}
