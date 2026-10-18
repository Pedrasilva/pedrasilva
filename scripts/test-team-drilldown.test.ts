import { describe, it, expect } from "vitest";
import { capacityCutoff, computeCapacity, breakdownLogged, hoursPerWeek, daysWithoutHours, type DrillEntry } from "../src/lib/projects/team-drilldown";

const L = { noStage: "-", uncategorised: "?", unknownProject: "??" };
describe("team drill-down", () => {
  it("compares up to today by default, whole month on toggle", () => {
    expect(capacityCutoff("2026-10-01", "2026-10-31", "2026-10-18", true)).toBe("2026-10-18");
    expect(capacityCutoff("2026-10-01", "2026-10-31", "2026-10-18", false)).toBe("2026-10-31");
  });
  it("net capacity = weekdays × daily − holidays − closures − approved leave", () => {
    const c = computeCapacity({
      start: "2026-10-01", end: "2026-10-16", dailyHours: 8,
      calendar: [{ date: "2026-10-05", name: "Implantação", closure: false }, { date: "2026-10-09", name: "Fecho", closure: true }],
      leaveEntries: [{ entry_date: "2026-10-12", hours: 8, leave_type: "Vacation" }, { entry_date: "2026-10-13", hours: 8, leave_type: "Authorized (unpaid)" }],
    });
    expect(c.weekdays).toBe(12);
    expect(c.gross).toBe(96);
    expect(c.net).toBe(72);
    expect(c.leave).toHaveLength(1);
    expect(c.workingDays).toHaveLength(9);
  });
  it("groups project→stage and internal, sorted, with % of total", () => {
    const e: DrillEntry[] = [
      { entry_date: "2026-10-01", hours: 6, billable: true, entry_type: "project", projectId: "p", projectName: "Uralchem", stageId: "s", stageLabel: "1 SD" },
      { entry_date: "2026-10-02", hours: 2, billable: false, entry_type: "internal", internal_category: "Marketing" },
      { entry_date: "2026-10-02", hours: 8, billable: false, entry_type: "non_working" },
    ];
    const b = breakdownLogged(e, L);
    expect(b.total).toBe(8);
    expect(b.lines[0]).toMatchObject({ label: "Uralchem", billable: true, pct: 0.75 });
    expect(b.lines[1]).toMatchObject({ kind: "internal", billable: false });
    expect(hoursPerWeek(e, "2026-10-01", "2026-10-09").map((w) => w.hours)).toEqual([8, 0]);
    expect(daysWithoutHours(["2026-10-01", "2026-10-02", "2026-10-05"], e)).toEqual(["2026-10-05"]);
  });
});
