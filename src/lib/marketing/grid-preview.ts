/** Pure ordering/proposal logic for the Planner Instagram grid preview. Client- and server-safe. */
export type GridDraftLite = { id: string; status: string; scheduled_at: string | null; created_at: string };
export type GridLiveLite = { id: string; timestamp?: string | null };

export type GridItem<D, L> =
  | { kind: "draft"; zone: "unscheduled"; draft: D }
  | { kind: "draft"; zone: "dated"; at: string; draft: D }
  | { kind: "live"; at: string | null; live: L };

/** Draft statuses shown as upcoming tiles. */
export const UPCOMING = ["pending_approval", "approved", "scheduled", "publishing", "failed"] as const;

/**
 * Profile order, newest first: drafts without a date (they will appear last, so on top, in the
 * curator's order), then dated drafts by scheduled_at desc, then real published posts by timestamp desc.
 */
export function buildGrid<D extends GridDraftLite, L extends GridLiveLite>(drafts: D[], live: L[], localOrder: string[] = []): GridItem<D, L>[] {
  const up = drafts.filter((d) => (UPCOMING as readonly string[]).includes(d.status));
  const rank = (id: string) => { const i = localOrder.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const unscheduled = up.filter((d) => !d.scheduled_at)
    .sort((a, b) => rank(a.id) - rank(b.id) || b.created_at.localeCompare(a.created_at));
  const dated = up.filter((d) => !!d.scheduled_at).sort((a, b) => b.scheduled_at!.localeCompare(a.scheduled_at!));
  const real = [...live].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  return [
    ...unscheduled.map((draft) => ({ kind: "draft" as const, zone: "unscheduled" as const, draft })),
    ...dated.map((draft) => ({ kind: "draft" as const, zone: "dated" as const, at: draft.scheduled_at!, draft })),
    ...real.map((l) => ({ kind: "live" as const, at: l.timestamp ?? null, live: l })),
  ];
}

const STEP = 5 * 60_000;
/**
 * Proposes a publication time between the newer neighbour (above) and the older one (below).
 * Never in the past; with no newer neighbour, one day after the lower bound. Returns null when no gap is left.
 */
export function proposeBetween(newer: string | null, older: string | null, now = new Date()): string | null {
  const lower = Math.max(older ? Date.parse(older) : now.getTime(), now.getTime());
  if (!newer) return new Date(Math.ceil((lower + 864e5) / STEP) * STEP).toISOString();
  const upper = Date.parse(newer);
  if (upper - lower < 2 * STEP) return null;
  const mid = Math.round((lower + (upper - lower) / 2) / STEP) * STEP;
  return new Date(mid).toISOString();
}

/** Neighbours for dropping before grid index `target` (the dropped tile takes that slot). */
export function neighboursAt<D, L>(items: GridItem<D, L>[], target: number): { newer: string | null; older: string | null } {
  const at = (i: GridItem<D, L>) => (i.kind === "live" ? i.at : i.zone === "dated" ? i.at : null);
  let newer: string | null = null, older: string | null = null;
  for (let i = target - 1; i >= 0; i--) { const a = at(items[i]); if (a) { newer = a; break; } }
  for (let i = target; i < items.length; i++) { const a = at(items[i]); if (a) { older = a; break; } }
  return { newer, older };
}

/** Moves `id` before `beforeId` (or to the end) within the unscheduled order. */
export function reorder(order: string[], id: string, beforeId: string | null): string[] {
  const rest = order.filter((x) => x !== id);
  const i = beforeId ? rest.indexOf(beforeId) : -1;
  return i < 0 ? [...rest, id] : [...rest.slice(0, i), id, ...rest.slice(i)];
}
