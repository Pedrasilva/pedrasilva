/** Retainer actuals use only saved positive snapshots, never team-rate estimates. */
export function retainerCostRate(snapshot: number | string | null | undefined): number {
  const locked = snapshot == null || snapshot === "" ? NaN : Number(snapshot);
  if (Number.isFinite(locked) && locked > 0) return locked;
  return NaN;
}

export function retainerCostAmount(hours: number, snapshot: number | string | null | undefined): number {
  return hours === 0 ? 0 : hours * retainerCostRate(snapshot);
}