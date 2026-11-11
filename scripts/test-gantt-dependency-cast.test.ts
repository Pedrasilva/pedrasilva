import { describe, expect, it } from "vitest";
import { moveStagesPatch, type ScheduleState } from "../src/lib/projects/schedule-engine";
import { readFileSync } from "node:fs";

describe("shared Gantt dependency persistence", () => {
  for (const type of ["FS", "SS", "FF", "SF"] as const) {
    it(`${type}: moving a linked stage retains its position and retimes the saved link`, () => {
      const state: ScheduleState = {
        stages: [{ id: "a", start_date: "2026-11-16", end_date: "2026-11-20" },
          { id: "b", start_date: "2026-11-23", end_date: "2026-11-27" }],
        dependencies: [{ id: "link", predecessor_id: "a", successor_id: "b", type, lag_days: 0 }],
        allocations: [], holidays: [], relative: false, revision: "fixture",
      };
      const patch = moveStagesPatch(state, [{ id: "b", start_date: "2026-11-24", end_date: "2026-11-30", move: true }]);
      expect(patch.stages.find(s => s.id === "b")).toEqual({ id: "b", start_date: "2026-11-24", end_date: "2026-11-30" });
      expect(patch.dependencies[0]?.type).toBe(type);
      expect(patch.dependencies[0]?.lag_days).not.toBe(0);
    });
  }
  it("the additive repair casts project JSON text to pm_dep_type and has an exact mirror", () => {
    const sql = readFileSync("drizzle/migrations/0278_gantt_dependency_enum_cast.sql", "utf8");
    expect(sql).toContain("(d->>''type'')::public.pm_dep_type");
    expect(readFileSync("supabase/migrations/20261111161000_gantt_dependency_enum_cast.sql", "utf8")).toBe(sql);
  });
});