/**
 * Integration-style test for commitAcceloImport stage reconstruction.
 *
 * Scenario:
 *   - Imported Accelo rows with no Stage column.
 *   - User assigns a default stage (mode: "create", name: "Imported from Accelo").
 *   - commit must:
 *       1. create one pm_stages row
 *       2. attach stage_id to historical_time_entries
 *       3. create pm_allocations for resourced rows
 *       4. report reconstructionFailed = false
 *
 * Run: bun test scripts/test-accelo-commit-integration.test.ts
 */
import { test, expect, mock } from "bun:test";

// ---- Fake Supabase ---------------------------------------------------------
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  companies: [],
  pm_projects: [{ id: "P1", name: "Project 1", external_id: "REF-1" }],
  pm_stages: [],
  historical_time_entries: [],
  pm_allocations: [],
  import_jobs: [{ id: "JOB-1", status: "previewed" }],
};

let stageSeq = 0;
let allocSeq = 0;

function makeQuery(table: string) {
  let rows = [...(tables[table] ?? [])];
  let pendingFilter: ((r: Row) => boolean)[] = [];
  let countMode: "exact" | null = null;
  let headOnly = false;
  let selectedCols: string | null = null;
  let updatePayload: Row | null = null;
  let upsertOpts: any = null;
  let inserting: Row | Row[] | null = null;

  const apply = () => rows.filter((r) => pendingFilter.every((f) => f(r)));

  const builder: any = {
    select(cols?: string, opts?: any) {
      selectedCols = cols ?? "*";
      if (opts?.count === "exact") countMode = "exact";
      if (opts?.head) headOnly = true;
      return builder;
    },
    eq(col: string, val: any) { pendingFilter.push((r) => r[col] === val); return builder; },
    in(col: string, vals: any[]) { pendingFilter.push((r) => vals.includes(r[col])); return builder; },
    is(col: string, _v: null) { pendingFilter.push((r) => r[col] == null); return builder; },
    not(col: string, _op: string, _v: any) { pendingFilter.push((r) => r[col] != null); return builder; },
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
      // For inserts, single() returns the inserted row; for selects, the first match
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
      // Terminal await: handle insert / update / upsert / select
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

function assignId(table: string, r: Row): Row {
  if (r.id) return r;
  if (table === "pm_stages") return { ...r, id: `S${++stageSeq}` };
  if (table === "pm_allocations") return { ...r, id: `A${++allocSeq}` };
  return { ...r, id: `${table}-${Math.random().toString(36).slice(2, 8)}` };
}

const fakeSupabase = {
  from(table: string) { return makeQuery(table); },
};

mock.module("@/integrations/supabase/client", () => ({ supabase: fakeSupabase }));

// ---- Test ------------------------------------------------------------------
test("commit creates default stage, links entries, creates allocations", async () => {
  const { commitAcceloImport } = await import("../src/lib/imports/accelo-importer.ts");

  const preview: any = {
    jobId: "JOB-1",
    storageWarning: null,
    totals: { rows: 2, error: 0, warning: 0, duplicates: 0 },
    unmatched: { collaborators: [], projects: [] },
    rows: [
      {
        status: "ok",
        matched: { project_id: "P1", resource_id: "R1", collaborator_id: "C1", company_id: null },
        row: {
          rowIndex: 1,
          external_id: "EXT-1",
          parent_reference: "REF-1",
          reference: null,
          stage_name: "",
          stage_start_date: null,
          stage_end_date: null,
          entry_date: "2024-02-01",
          billable_hours: 4,
          non_billable_hours: 0,
          amount: 100, cost: 50, profit: 50,
          subject: "x", content: "", from_email: "a@b.c",
          company: "", rate_title: null, rate: null,
          status_text: null, invoice_number: null,
          raw: {},
        },
      },
      {
        status: "ok",
        matched: { project_id: "P1", resource_id: "R1", collaborator_id: "C1", company_id: null },
        row: {
          rowIndex: 2,
          external_id: "EXT-2",
          parent_reference: "REF-1",
          reference: null,
          stage_name: "",
          stage_start_date: null,
          stage_end_date: null,
          entry_date: "2024-02-15",
          billable_hours: 2,
          non_billable_hours: 0,
          amount: 50, cost: 25, profit: 25,
          subject: "y", content: "", from_email: "a@b.c",
          company: "", rate_title: null, rate: null,
          status_text: null, invoice_number: null,
          raw: {},
        },
      },
    ],
  };

  const result = await commitAcceloImport(preview, {
    createMissingProjects: false,
    createMissingCompanies: false,
    projectMapping: { "REF-1": { mode: "existing", project_id: "P1" } },
    defaultStageByProject: { P1: { mode: "create", name: "Imported from Accelo" } },
  });

  expect(tables.pm_stages.length).toBeGreaterThanOrEqual(1);
  const stage = tables.pm_stages.find((s) => s.project_id === "P1")!;
  expect(stage).toBeDefined();
  expect(stage.name).toBe("Imported from Accelo");

  const entries = tables.historical_time_entries.filter((e) => e.project_id === "P1");
  expect(entries.length).toBe(2);
  for (const e of entries) expect(e.stage_id).toBe(stage.id);

  const allocs = tables.pm_allocations.filter((a) => a.stage_id === stage.id);
  expect(allocs.length).toBe(1);
  expect(allocs[0].resource_id).toBe("R1");

  const diag = result.diagnostics.find((d) => d.project_id === "P1")!;
  expect(diag.reconstructionFailed).toBe(false);
  expect(diag.entriesWithoutStage).toBe(0);
  expect(diag.historicalEntriesWithStage).toBe(2);
  expect(diag.allocationsForProject).toBeGreaterThanOrEqual(1);
});

test("commit resolves matched.project_id=null via projectMapping + DB fallback", async () => {
  // Reset side-effect state from the previous test by appending a NEW project.
  tables.pm_projects.push({ id: "P2", name: "Project 2", external_id: "REF-2" });
  const { commitAcceloImport } = await import("../src/lib/imports/accelo-importer.ts");

  const preview: any = {
    jobId: "JOB-1",
    storageWarning: null,
    totals: { rows: 1, error: 0, warning: 0, duplicates: 0 },
    unmatched: { collaborators: [], projects: ["REF-2"] },
    rows: [
      {
        status: "warning",
        // Critical: matched.project_id is null (stale preview snapshot).
        matched: { project_id: null, resource_id: "R2", collaborator_id: "C2", company_id: null },
        row: {
          rowIndex: 10,
          external_id: "EXT-10",
          parent_reference: "REF-2",
          reference: null,
          stage_name: "",
          stage_start_date: null,
          stage_end_date: null,
          entry_date: "2024-03-01",
          billable_hours: 3,
          non_billable_hours: 0,
          amount: 60, cost: 30, profit: 30,
          subject: "z", content: "", from_email: "x@y.z",
          company: "", rate_title: null, rate: null,
          status_text: null, invoice_number: null,
          raw: {},
        },
      },
    ],
  };

  const result = await commitAcceloImport(preview, {
    createMissingProjects: false,
    createMissingCompanies: false,
    projectMapping: { "REF-2": { mode: "existing", project_id: "P2" } },
    defaultStageByProject: { P2: { mode: "create", name: "Imported from Accelo" } },
  });

  const stage = tables.pm_stages.find((s) => s.project_id === "P2")!;
  expect(stage).toBeDefined();
  const entries = tables.historical_time_entries.filter((e) => e.project_id === "P2");
  expect(entries.length).toBe(1);
  expect(entries[0].stage_id).toBe(stage.id);
  const allocs = tables.pm_allocations.filter((a) => a.stage_id === stage.id);
  expect(allocs.length).toBe(1);
  const diag = result.diagnostics.find((d) => d.project_id === "P2")!;
  expect(diag.reconstructionFailed).toBe(false);
  expect(diag.entriesWithoutStage).toBe(0);
});
