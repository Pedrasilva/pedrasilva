/** Missing costs remain visibly incomplete, never a silent zero. Locked positive
 * snapshots win; a caller may supply an evidence-based current cost fallback. */
export function retainerCostRate(snapshot: number | string | null | undefined, fallback?: number): number {
  const locked = snapshot == null || snapshot === "" ? NaN : Number(snapshot);
  if (Number.isFinite(locked) && locked > 0) return locked;
  return fallback != null && Number.isFinite(fallback) && fallback > 0 ? fallback : NaN;
}