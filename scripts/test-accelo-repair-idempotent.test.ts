/**
 * Idempotency test for repairProjectOrphanEntries.
 *
 * Running repair twice for the same project must NOT:
 *  - duplicate pm_stages
 *  - duplicate pm_allocations
 *  - re-backfill entries that already have a stage_id
 *
 * Running on a project with 0 historical entries returns a friendly message
 * instead of throwing.
 *
 * Run: bun test scripts/test-accelo-repair-idempotent.test.ts
 */
import { test, expect, mock, beforeAll } from "bun:test";

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  pm_projects: [
    { id: "P1", name: "Project 1" },
    { id: "P_EMPTY", name: "Empty Project" },
  ],
  pm_stages: [],
  historical_time_entries: [
    { id: "H1", project_id: "P1", entry_date: "2024-02-01", resource_id: "R1", billable_hours: 4, non_billable_hours: 0, stage_id: null },
    { id: "H2", project_id: "P1", entry_date: "2024-02-10", resource_id: "R1", billable_hours: 2, non_billable_hours: 0, stage_id: null },
    { id: "H3", project_id: "P1", entry_date: "2024-02-20", resource_id: "R2", billable_hours: 3, non_billable_hours: 1, stage_id: null },
  ],
  pm_allocations: [],
};

let stageSeq = 0;
let allocSeq = 0;

function assignId(table: string, r: Row): Row {
  if (r.id) return r;
  if (table === "pm_stages") return { ...r, id: `S${++stageSeq}` };
  if (table === "pm_allocations") return { ...r, id: `A${++allocSeq}` };
  return { ...r, id: `${table}-${Math.random().toString(36).slice(2, 8)}` };
}

function makeQuery(table: string) {
  let pendingFilter: ((r: Row) => boolean)[] = [];
  let countMode: "exact" | null = null;
  let headOnly = false;
  let updatePayload: Row | null = null;
  let upsertOpts: any = null;
  let inserting: Row | Row[] | null = null;

  const rowsRef = () => tables[table] ?? [];
  const apply = () => rowsRef().filter((r) => pendingFilter.every((f) => f(r)));

  const builder: any = {
    select(_cols?: string, opts?: any) {
      if (opts?.count === "exact") countMode = "exact";
      if (opts?.head) headOnly = true;
      return builder;
    },
    eq(col: string, val: any) { pendingFilter.push((r) => r[col] === val); return builder; },
    in(col: string, vals: any[]) { pendingFilter.push((r) => vals.includes(r[col])); return builder; },
    is(col: string, _v: null) { pendingFilter.push((r) => r[col] == null); return builder; },
    not(col: string, _op: string, _v: any) { pendingFilter.push((r) => r[col] != null); return builder; },
    ilike(col: string, val: string) {
      const v = String(val).toLowerCase();
      pendingFilter.push((r) => String(r[col] ?? "").toLowerCase() === v);
      return builder;
    },
    order() { return builder; },
    limit() { return builder; },
    insert(payload: Row | Row[]) { inserting = payload; return builder; },
    update(payload: Row) { updatePayload = payload; return builder; },
    upsert(payload: Row[], opts?: any) { inserting = payload; upsertOpts = opts; return builder; },
    maybeSingle() {
      const r = apply();
      return Promise.resolve({ data: r[0] ?? null, error: null });
    },
    single() {
      if (inserting) {
        const arr = Array.isArray(inserting) ? inserting : [inserting];
        const created = arr.map((r) => assignId(table, r));
        tables[table].push(...created);
        return Promise.resolve({ data: created[0], error: null });
      }
      const r = apply();
      return Promise.resolve({ data: r[0] ?? null, error: null });
    },
    then(resolve: any) {
      if (updatePayload) {
        const targets = apply();
        for (const t of targets) Object.assign(t, updatePayload);
        return resolve({ data: targets, error: null, count: targets.length });
      }
      if (inserting) {
        const arr = Array.isArray(inserting) ? inserting : [inserting];
        if (upsertOpts?.onConflict) {
          const keys = upsertOpts.onConflict.split(",");
          const survivors: Row[] = [];
          for (const incoming of arr) {
            const existing = tables[table].find((existing) =>
              keys.every((k: string) => existing[k] === incoming[k]),
            );
            if (existing) Object.assign(existing, incoming);
            else survivors.push(assignId(table, incoming));
          }
          tables[table].push(...survivors);
          const out = arr.map((incoming) =>
            tables[table].find((r) => keys.every((k: string) => r[k] === incoming[k])),
          );
          return resolve({ data: out, error: null, count: arr.length });
        }
        const created = arr.map((r) => assignId(table, r));
        tables[table].push(...created);
        return resolve({ data: created, error: null, count: created.length });
      }
      const r = apply();
      if (countMode) {
        return resolve({ data: headOnly ? null : r, count: r.length, error: null });
      }
      return resolve({ data: r, error: null, count: r.length });
    },
  };
  return builder;
}

const fakeSupabase = { from(table: string) { return makeQuery(table); } };
mock.module("@/integrations/supabase/client", () => ({ supabase: fakeSupabase }));

let repairProjectOrphanEntries: typeof import("../src/lib/imports/accelo-importer.ts").repairProjectOrphanEntries;

beforeAll(async () => {
  ({ repairProjectOrphanEntries } = await import("../src/lib/imports/accelo-importer.ts"));
});

test("first repair creates 1 stage, backfills 3 entries, creates 2 allocations", async () => {
  const r = await repairProjectOrphanEntries({ project_id: "P1", stage_name: "Imported" });
  expect(r.stage_created).toBe(true);
  expect(r.entries_backfilled).toBe(3);
  expect(r.allocations_upserted).toBe(2);
  expect(tables.pm_stages.filter((s) => s.project_id === "P1").length).toBe(1);
  expect(tables.pm_allocations.length).toBe(2);
  expect(r.diagnostic.entriesWithoutStage).toBe(0);
  expect(r.diagnostic.reconstructionFailed).toBe(false);
});

test("second repair is a no-op: no duplicate stages or allocations, 0 backfilled", async () => {
  const stagesBefore = tables.pm_stages.length;
  const allocsBefore = tables.pm_allocations.length;

  const r = await repairProjectOrphanEntries({ project_id: "P1", stage_name: "Imported" });

  expect(r.stage_created).toBe(false);
  expect(r.stage_reused_reason).toBe("external_id");
  expect(r.entries_backfilled).toBe(0);
  expect(tables.pm_stages.length).toBe(stagesBefore);
  expect(tables.pm_allocations.length).toBe(allocsBefore);
  expect(r.diagnostic.reconstructionFailed).toBe(false);
});

test("repair on project with 0 entries returns friendly message, no throw", async () => {
  const r = await repairProjectOrphanEntries({ project_id: "P_EMPTY" });
  expect(r.message).toContain("No historical entries");
  expect(r.stage_id).toBeNull();
  expect(r.entries_backfilled).toBe(0);
  expect(r.allocations_upserted).toBe(0);
});
