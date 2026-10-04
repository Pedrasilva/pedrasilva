/**
 * "Billable vs non-billable" report — pure calculation (no Supabase calls).
 *
 * Kinds of time (leave/holidays = non_working are excluded from every %):
 *   billable     = project entries with billable = true
 *   projectNonBillable = project entries with billable = false
 *   internal     = internal entries (by internal_category, Pursuit included)
 *
 * billable % here equals utilizationPct from business-performance.ts
 * (entryFigures is reused so both reports always agree).
 */
import { entryFigures, bucketKey, bucketKindFor, type BPEntry, type BucketKind } from "./business-performance";

export interface SplitEntry extends BPEntry {
  internal_category: string | null;
}

export interface Split {
  billable: number;
  nonBillable: number;
  internal: number;
  logged: number;
  leave: number;
}

const ZERO_RATES = { saleRate: 0, costRate: 0 };

export function emptySplit(): Split {
  return { billable: 0, nonBillable: 0, internal: 0, logged: 0, leave: 0 };
}

export function addEntry(s: Split, e: SplitEntry) {
  if (e.entry_type === "non_working") {
    s.leave += e.hours;
    return;
  }
  const f = entryFigures(e, ZERO_RATES);
  if (!f) return;
  s.logged += f.hours;
  if (f.billableHours > 0) s.billable += f.billableHours;
  else if (e.entry_type === "project") s.nonBillable += f.hours;
  else s.internal += f.hours;
}

export function splitOf(entries: SplitEntry[]): Split {
  const s = emptySplit();
  for (const e of entries) addEntry(s, e);
  return s;
}

export const pctOf = (part: number, s: Split) => (s.logged > 0 ? (part / s.logged) * 100 : null);

export function internalByCategory(entries: SplitEntry[]): { category: string; hours: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) {
    if (e.entry_type !== "internal") continue;
    const k = e.internal_category?.trim() || "—";
    m.set(k, (m.get(k) ?? 0) + e.hours);
  }
  return [...m.entries()].map(([category, hours]) => ({ category, hours })).sort((a, b) => b.hours - a.hours);
}

export function bucketKeys(start: string, end: string, kind: BucketKind): string[] {
  const keys: string[] = [];
  const d = new Date(start + "T00:00:00");
  const endD = new Date(end + "T00:00:00");
  while (d <= endD) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const k = bucketKey(iso, kind);
    if (keys[keys.length - 1] !== k) keys.push(k);
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

export function splitSeries(entries: SplitEntry[], start: string, end: string, kind = bucketKindFor(start, end)) {
  const keys = bucketKeys(start, end, kind);
  const m = new Map(keys.map((k) => [k, emptySplit()]));
  for (const e of entries) {
    const s = m.get(bucketKey(e.entry_date, kind));
    if (s) addEntry(s, e);
  }
  return { kind, points: keys.map((k) => ({ key: k, ...m.get(k)! })) };
}

/** Logged-hours-weighted mean of HR targets (people without a target are skipped). */
export function weightedTarget(rows: { logged: number; targetPct: number | null }[]): number | null {
  let w = 0;
  let sum = 0;
  for (const r of rows) {
    if (r.targetPct == null || r.targetPct <= 0 || r.logged <= 0) continue;
    w += r.logged;
    sum += r.logged * r.targetPct;
  }
  return w > 0 ? sum / w : null;
}

export interface ProjectSplitRow {
  projectId: string | null;
  stageId: string | null;
  billable: number;
  nonBillable: number;
}

export function byProjectStage(entries: SplitEntry[], stageOf: (e: SplitEntry) => string | null, projectOfStage: (sid: string) => string | null): ProjectSplitRow[] {
  const m = new Map<string, ProjectSplitRow>();
  for (const e of entries) {
    if (e.entry_type !== "project") continue;
    const sid = stageOf(e);
    const pid = sid ? projectOfStage(sid) : null;
    const k = `${pid}|${sid}`;
    const r = m.get(k) ?? { projectId: pid, stageId: sid, billable: 0, nonBillable: 0 };
    if (e.billable) r.billable += e.hours;
    else r.nonBillable += e.hours;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.billable + b.nonBillable - (a.billable + a.nonBillable));
}
