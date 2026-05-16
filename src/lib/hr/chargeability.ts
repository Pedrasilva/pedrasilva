// Target chargeability — observational HR field (Phase 0).
//
// `collaborators.target_chargeability_pct` represents the EXPECTED percentage
// of a collaborator's weekly capacity that should be recoverable through
// project work. It is NOT:
//   - FTE (that's `computeCollaboratorFte` from ./fte)
//   - actual billable% (that's measured from `pm_time_entries.billable`)
//   - a multiplier consumed by `computePricing`, `useDefaultResourceRates`,
//     `pm_resources.cost_rate`, BO overhead distribution, or planner overload
//
// In Phase 0 it is read/displayed in HR UI only. Future phases may surface
// derived guidance (e.g. recovery-adjusted €/h) but the costing engine stays
// untouched.

const FALLBACK_DAILY_HOURS = 8;
const FALLBACK_DAYS_PER_WEEK = 5;

/**
 * Derive weekly capacity from a collaborator's contractual schedule.
 * Mirrors the same formula the PM resource sync uses (daily_hours × days_per_week).
 * Falls back to 40h when fields are missing/invalid.
 */
export function computeWeeklyCapacity(
  dailyHours: number | null | undefined,
  daysPerWeek: number | null | undefined,
): number {
  const dh = Number(dailyHours);
  const dpw = Number(daysPerWeek);
  const safeDh = Number.isFinite(dh) && dh > 0 ? dh : FALLBACK_DAILY_HOURS;
  const safeDpw = Number.isFinite(dpw) && dpw > 0 ? dpw : FALLBACK_DAYS_PER_WEEK;
  return safeDh * safeDpw;
}

/**
 * Expected recoverable hours per week given a capacity and a target %.
 * Returns null when the target is not defined (NULL in DB) — the UI MUST
 * render "not defined" rather than silently assuming 100%.
 */
export function computeRecoverableHours(
  weeklyCapacity: number,
  targetChargeabilityPct: number | null | undefined,
): number | null {
  if (
    targetChargeabilityPct == null ||
    !Number.isFinite(Number(targetChargeabilityPct))
  ) {
    return null;
  }
  const pct = Number(targetChargeabilityPct);
  if (pct < 0) return 0;
  const clamped = Math.min(pct, 100);
  if (!Number.isFinite(weeklyCapacity) || weeklyCapacity <= 0) return 0;
  return weeklyCapacity * (clamped / 100);
}

/**
 * Format a chargeability percentage for display. NULL → null (caller renders
 * the "not defined" label so the wording stays in i18n, not in this helper).
 */
export function formatChargeabilityPct(
  value: number | null | undefined,
  locale: string = "pt-PT",
): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return (
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(Number(value)) + "%"
  );
}

/**
 * Format an hours-per-week value for display.
 */
export function formatHoursPerWeek(
  hours: number | null | undefined,
  locale: string = "pt-PT",
): string {
  if (hours == null || !Number.isFinite(Number(hours))) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(Number(hours));
}
