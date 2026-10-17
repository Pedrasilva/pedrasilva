import { test } from "node:test";
import assert from "node:assert/strict";
import { rebuildPeriods, processQueue } from "../src/lib/projects/cost-rates.server";

function fakeDb(fail = false) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const rows: Record<string, unknown> = {
    collaborators: [], salary_snapshots: [], bo_settings: null, pm_resources: [],
    pm_cost_rate_rebuild_queue: [{ id: "queued", from_date: "2026-01-01" }],
  };
  const db = {
    from(table: string) {
      const result = { data: rows[table], error: null };
      const chain = { select: () => chain, limit: () => chain, maybeSingle: async () => result, is: async () => result,
        then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
      return chain;
    },
    async rpc(name: string, args?: unknown) {
      calls.push({ name, args });
      if (name === "pm_cost_period_revision") return { data: "revision", error: null };
      return fail ? { data: null, error: new Error("interrupted") } : { data: 0, error: null };
    },
  };
  return { db: db as unknown as Parameters<typeof rebuildPeriods>[0], calls };
}
test("full rebuild uses one atomic write for periods and queued acknowledgement", async () => {
  const { db, calls } = fakeDb();
  await processQueue(db, true);
  assert.deepEqual(calls, [
    { name: "pm_cost_period_revision", args: undefined },
    { name: "pm_replace_cost_periods", args: { _from: "1900-01-01", _periods: [], _expected_revision: "revision", _queue_ids: ["queued"] } },
  ]);
});
test("an interrupted atomic write fails the rebuild without a separate queue write", async () => {
  const { db, calls } = fakeDb(true);
  await assert.rejects(processQueue(db, true), /interrupted/);
  assert.equal(calls.filter(c => c.name === "pm_replace_cost_periods").length, 1);
});