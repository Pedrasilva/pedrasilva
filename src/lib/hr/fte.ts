// Derived FTE (Full-Time Equivalent) helper.
//
// FTE is NEVER persisted — it is derived on the fly from the collaborator's
// contractual schedule (`collaborators.daily_hours` × `days_per_week`) versus
// the studio's standard full-time week (default 8h × 5d = 40h).
//
// Examples:
//   8h × 5d / (8 × 5) = 1.0  (full-time)
//   4h × 5d / (8 × 5) = 0.5  (half-time)
//   6h × 5d / (8 × 5) = 0.75
//   8h × 3d / (8 × 5) = 0.6
//
// Used by costing (per-collaborator productive hours + FTE-weighted BO
// overhead allocation). Capacity/planning code keeps using daily_hours /
// days_per_week directly — this helper is a pure derivation, not a new
// source of truth.

const STANDARD_DAYS_PER_WEEK = 5;
const DEFAULT_STANDARD_DAILY_HOURS = 8;
const FALLBACK_FTE = 1.0;

function safeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Compute a collaborator's FTE ratio from their contractual schedule.
 * Returns 1.0 for legacy collaborators with missing/invalid schedule values.
 * Clamped to (0, 1.5] to protect downstream divisions from absurd inputs.
 */
export function computeCollaboratorFte(
  dailyHours: number | null | undefined,
  daysPerWeek: number | null | undefined,
  standardDailyHours: number = DEFAULT_STANDARD_DAILY_HOURS,
): number {
  const dh = Number(dailyHours);
  const dpw = Number(daysPerWeek);
  // Legacy / missing schedule → assume full-time so costing stays stable.
  if (!Number.isFinite(dh) || dh <= 0 || !Number.isFinite(dpw) || dpw <= 0) {
    return FALLBACK_FTE;
  }
  const std = safeNumber(standardDailyHours, DEFAULT_STANDARD_DAILY_HOURS);
  const denom = std * STANDARD_DAYS_PER_WEEK;
  if (denom <= 0) return FALLBACK_FTE;
  const fte = (dh * dpw) / denom;
  if (!Number.isFinite(fte) || fte <= 0) return FALLBACK_FTE;
  // Clamp to a sane ceiling to protect overhead division.
  return Math.min(fte, 1.5);
}

/**
 * Resolve the productive daily hours for a collaborator. Falls back to the
 * studio's standard daily hours when the contract value is missing/invalid.
 */
export function effectiveDailyHours(
  dailyHours: number | null | undefined,
  standardDailyHours: number = DEFAULT_STANDARD_DAILY_HOURS,
): number {
  const dh = Number(dailyHours);
  if (Number.isFinite(dh) && dh > 0) return dh;
  return safeNumber(standardDailyHours, DEFAULT_STANDARD_DAILY_HOURS);
}
