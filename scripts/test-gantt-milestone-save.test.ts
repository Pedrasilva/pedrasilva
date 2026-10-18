import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleState, SchedulePatch } from "../src/lib/projects/schedule-engine";

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
import { changeGanttStages, undoGanttSchedule } from "../src/lib/projects/gantt-schedule";

const original = (): ScheduleState => ({
  stages: [
    { id: "milestone", start_date: "2026-10-23", end_date: "2026-10-23" },
    { id: "next", start_date: "2026-10-26", end_date: "2026-10-30" },
  ],
  allocations: [{ id: "booking", stage_id: "next", start_date: "2026-10-26", end_date: "2026-10-30" }],
  dependencies: [{ id: "link", predecessor_id: "milestone", successor_id: "next", type: "FS", lag_days: 0 }],
  holidays: [], relative: false, revision: "initial",
});
let state: ScheduleState;
let rejectSave: boolean;
beforeEach(() => {
  state = original(); rejectSave = false; mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "pm_gantt_state") return { data: structuredClone(state), error: null };
    if (rejectSave) return { data: null, error: { message: "gantt.schedule.stale" } };
    const before = structuredClone(state);
    const patch = args._patch as SchedulePatch;
    state = { ...state, stages: state.stages.map(s => ({ ...s, ...patch.stages.find(p => p.id === s.id) })),
      allocations: state.allocations.map(a => ({ ...a, ...patch.allocations.find(p => p.id === a.id) })),
      dependencies: patch.dependencies, revision: `${state.revision}-saved` };
    return { data: { before, after: structuredClone(state) }, error: null };
  });
});
describe("milestone date saves", () => {
  for (const mode of ["project", "quote"] as const) it(`${mode}: one atomic save moves milestone, successor and booking; Undo and Redo restore all`, async () => {
    const scope = `milestone-${mode}`;
    await changeGanttStages(mode, scope, [{ id: "milestone", start_date: "2026-10-26", end_date: "2026-10-26", move: true }]);
    expect(mock.rpc.mock.calls.filter(c => c[0] === "pm_gantt_save")).toHaveLength(1);
    expect(state.stages.map(s => [s.start_date, s.end_date])).toEqual([["2026-10-26", "2026-10-26"], ["2026-10-27", "2026-11-02"]]);
    expect(state.allocations[0]?.start_date).toBe("2026-10-27");
    await undoGanttSchedule(mode, scope);
    expect(state.stages).toEqual(original().stages);
    expect(state.allocations).toEqual(original().allocations);
    expect(state.dependencies).toEqual(original().dependencies);
    await undoGanttSchedule(mode, scope, true);
    expect(state.stages[0]?.start_date).toBe("2026-10-26");
    expect(state.allocations[0]?.start_date).toBe("2026-10-27");
  });
  it("failed atomic save leaves all dates unchanged and creates no undo entry", async () => {
    rejectSave = true;
    await expect(changeGanttStages("project", "failed-milestone", [{ id: "milestone", start_date: "2026-10-26", end_date: "2026-10-26", move: true }])).rejects.toThrow("gantt.schedule.stale");
    expect(state).toEqual(original());
    mock.rpc.mockClear();
    await undoGanttSchedule("project", "failed-milestone");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});