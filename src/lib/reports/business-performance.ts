/**
 * Business performance — pure calculation (no Supabase calls).
 *
 * Single source for the projects dashboard "Business performance" card and
 * the Reports → Business performance report, so both show the same numbers.
 *
 *   revenue     = billable project hours × sale rate (not invoiced revenue)
 *   cost        = all worked hours × locked cost-rate snapshot (fallback: current cost rate)
 *   profit      = revenue − cost
 *   utilisation = billable hours / all worked hours
 *   capacity    = active resources' weekly_capacity / 5 × working days
 */
import {
  effectiveCostRate,
  effectiveSaleRate,
  lockedCostRate,
  type DefaultRateInfo,
} from "@/lib/projects/use-default-rates";

export interface BPEntry {
  user_id: string;
  task_id: string | null;
  entry_date: string;
  hours: number;
  billable: boolean;
  entry_type: "project" | "internal" | "non_working" | string;
  cost_rate_snapshot: number | null;
}

export interface BPRates {
  saleRate: number;
  costRate: number;
}

export interface BusinessPerformance {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  utilizationPct: number;
  capacityUsedHours: number;
  capacityAvailableHours: number;
  billableHours: number;
}

export interface BPResourceLike {
  id: string;
  active?: boolean | null;
  weekly_capacity?: number | string | null;
  hourly_rate?: number | null;
  cost_rate?: number | null;
  hourly_rate_is_override?: boolean | null;
}

/** Per-entry figures. Non-working rows return null (never counted). */
export function entryFigures(e: BPEntry, rates: BPRates) {
  if (e.entry_type === "non_working") return null;
  const billable = !!e.billable && e.entry_type === "project";
  return {
    hours: e.hours,
    billableHours: billable ? e.hours : 0,
    revenue: billable ? e.hours * rates.saleRate : 0,
    cost: e.hours * lockedCostRate(e.cost_rate_snapshot, rates.costRate),
  };
}

export function computeBusinessPerformance(input: {
  entries: BPEntry[];
  ratesFor: (e: BPEntry) => BPRates;
  capacityHours: number;
}): BusinessPerformance {
  let revenue = 0;
  let cost = 0;
  let billableHours = 0;
  let totalLogged = 0;
  for (const e of input.entries) {
    const f = entryFigures(e, input.ratesFor(e));
    if (!f) continue;
    revenue += f.revenue;
    cost += f.cost;
    totalLogged += f.hours;
    billableHours += f.billableHours;
  }
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    utilizationPct: totalLogged > 0 ? (billableHours / totalLogged) * 100 : 0,
    capacityUsedHours: totalLogged,
    capacityAvailableHours: input.capacityHours,
    billableHours,
  };
}

/** Daily capacity of one resource (weekly_capacity / 5, default 40 h). */
export function resourceDailyCapacity(r: BPResourceLike | undefined): number {
  return (Number(r?.weekly_capacity) || 40) / 5;
}

/** Studio capacity: active resources × daily capacity × working days. */
export function studioCapacityHours(resources: BPResourceLike[], workingDayCount: number): number {
  let total = 0;
  for (const r of resources) {
    if (!r.active) continue;
    total += resourceDailyCapacity(r) * workingDayCount;
  }
  return total;
}

/**
 * Rate resolution used by the dashboard: the entry's task → stage → that
 * stage's first allocation resource; sale/cost from that resource with the
 * HR default-rate fallback.
 */
export function makeRateResolver(input: {
  taskToStage: Map<string, string> | undefined;
  stageRepResource: (stageId: string) => string | null;
  resources: BPResourceLike[] | undefined;
  defaultRates: Map<string, DefaultRateInfo> | undefined;
}): (e: BPEntry) => BPRates {
  const byId = new Map((input.resources ?? []).map((r) => [r.id, r]));
  return (e) => {
    let resourceId: string | null = null;
    if (e.task_id && input.taskToStage) {
      const stageId = input.taskToStage.get(e.task_id);
      if (stageId) resourceId = input.stageRepResource(stageId);
    }
    const res = resourceId ? byId.get(resourceId) : undefined;
    return {
      saleRate: effectiveSaleRate(res?.hourly_rate, resourceId ?? "", input.defaultRates, !!res?.hourly_rate_is_override),
      costRate: effectiveCostRate(res?.cost_rate, resourceId ?? "", input.defaultRates, !!res?.hourly_rate_is_override),
    };
  };
}

/** % change vs previous period; null when the previous value is 0. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------- report helpers

export type BucketKind = "week" | "month";

/** Weekly buckets for periods up to ~3 months, monthly beyond. */
export function bucketKindFor(start: string, end: string): BucketKind {
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return days <= 93 ? "week" : "month";
}

function isoMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function bucketKey(iso: string, kind: BucketKind): string {
  return kind === "month" ? iso.slice(0, 7) : isoMonday(iso);
}

export interface BucketPoint {
  key: string;
  revenue: number;
  cost: number;
  profit: number;
  utilizationPct: number;
}

export function bucketSeries(
  entries: BPEntry[],
  ratesFor: (e: BPEntry) => BPRates,
  start: string,
  end: string,
  kind: BucketKind,
): BucketPoint[] {
  const keys: string[] = [];
  const d = new Date(start + "T00:00:00");
  const endD = new Date(end + "T00:00:00");
  while (d <= endD) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const k = bucketKey(iso, kind);
    if (keys[keys.length - 1] !== k) keys.push(k);
    d.setDate(d.getDate() + 1);
  }
  const groups = new Map<string, BPEntry[]>(keys.map((k) => [k, []]));
  for (const e of entries) groups.get(bucketKey(e.entry_date, kind))?.push(e);
  return keys.map((k) => {
    const r = computeBusinessPerformance({ entries: groups.get(k) ?? [], ratesFor, capacityHours: 0 });
    return { key: k, revenue: r.revenue, cost: r.cost, profit: r.profit, utilizationPct: r.utilizationPct };
  });
}

export interface ProjectPerfRow {
  projectId: string;
  hours: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;
}

export function byProject(
  entries: BPEntry[],
  ratesFor: (e: BPEntry) => BPRates,
  projectOf: (e: BPEntry) => string | null,
): ProjectPerfRow[] {
  const m = new Map<string, ProjectPerfRow>();
  for (const e of entries) {
    if (e.entry_type !== "project") continue;
    const pid = projectOf(e);
    if (!pid) continue;
    const f = entryFigures(e, ratesFor(e));
    if (!f) continue;
    const row = m.get(pid) ?? { projectId: pid, hours: 0, revenue: 0, cost: 0, profit: 0, marginPct: null };
    row.hours += f.hours;
    row.revenue += f.revenue;
    row.cost += f.cost;
    m.set(pid, row);
  }
  return [...m.values()].map((r) => ({
    ...r,
    profit: r.revenue - r.cost,
    marginPct: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : null,
  }));
}

export interface PersonPerfRow {
  userId: string;
  capacity: number;
  logged: number;
  billablePct: number | null;
  internalPct: number | null;
  /** HR target chargeability (0..100); internal allowed = 100 − target. */
  targetPct: number | null;
  overInternal: boolean;
}

export function byPerson(
  entries: BPEntry[],
  people: { userId: string; capacity: number; targetPct: number | null }[],
): PersonPerfRow[] {
  const acc = new Map<string, { logged: number; billable: number }>();
  for (const e of entries) {
    if (e.entry_type === "non_working") continue;
    const a = acc.get(e.user_id) ?? { logged: 0, billable: 0 };
    a.logged += e.hours;
    if (e.billable && e.entry_type === "project") a.billable += e.hours;
    acc.set(e.user_id, a);
  }
  return people.map((p) => {
    const a = acc.get(p.userId) ?? { logged: 0, billable: 0 };
    const billablePct = a.logged > 0 ? (a.billable / a.logged) * 100 : null;
    const internalPct = billablePct == null ? null : 100 - billablePct;
    const allowed = p.targetPct != null && p.targetPct > 0 ? 100 - Math.min(100, p.targetPct) : null;
    return {
      userId: p.userId,
      capacity: p.capacity,
      logged: a.logged,
      billablePct,
      internalPct,
      targetPct: p.targetPct,
      overInternal: allowed != null && internalPct != null && internalPct > allowed,
    };
  });
}
