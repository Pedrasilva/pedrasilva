import { describe, it, expect } from "vitest";
import { convertedQuoteSchedule, proposalUsesRelativeDates } from "../src/lib/projects/converted-quote-schedule";
import type { StageWithAllocations } from "../src/lib/projects/types";

const quote = [{ id: "q1", name: "Design", parent_stage_id: null, sort_order: 10 }];
const live = (extra = {}): StageWithAllocations => ({ id: "p1", project_id: "project", source_quote_stage_id: "q1",
  name: "Design", start_date: "2026-12-21", end_date: "2027-01-12", sort_order: 99, parent_stage_id: null,
  allocations: [{ id: "a1", stage_id: "p1", source_quote_allocation_id: "qa1", start_date: "2026-12-21", end_date: "2027-01-12" }],
  ...extra } as StageWithAllocations);
describe("converted quote schedule", () => {
  it("conversion always overrides relative rows and year-2000 placeholders", () => {
    expect(proposalUsesRelativeDates("project", true, true)).toBe(false);
    expect(proposalUsesRelativeDates(null, true, true)).toBe(true);
  });
  it("keeps operational stage and allocation IDs and dates, using quote WBS only for display", () => {
    const result = convertedQuoteSchedule("project", quote, [{ id: "qa1", stage_id: "q1" }], [live()]);
    expect(result.issues).toEqual([]);
    expect(result.stages[0]).toMatchObject({ id: "p1", start_date: "2026-12-21", end_date: "2027-01-12", sort_order: 10 });
    expect(result.stages[0].allocations[0]).toMatchObject({ id: "a1", start_date: "2026-12-21", end_date: "2027-01-12" });
  });
  it("blocks a missing stage mapping without name-based fallback", () => {
    expect(convertedQuoteSchedule("project", quote, [], [live({ source_quote_stage_id: null, allocations: [] })]).issues).toEqual(["Design"]);
  });
  it("blocks ambiguous stage mapping", () => {
    expect(convertedQuoteSchedule("project", quote, [], [live({ allocations: [] }), live({ id: "p2", allocations: [] })]).issues).toEqual(["Design"]);
  });
  it("rejects stage matches from a different project", () => {
    expect(convertedQuoteSchedule("project", quote, [], [live({ project_id: "other", allocations: [] })]).issues).toEqual(["Design"]);
  });
  it("blocks missing allocations rather than writing to the proposal", () => {
    expect(convertedQuoteSchedule("project", quote, [{ id: "qa1", stage_id: "q1" }], [live({ allocations: [] })]).issues).toEqual(["Design"]);
  });
  it("blocks duplicate allocations on the same live stage", () => {
    const stage = live(); stage.allocations.push({ ...stage.allocations[0], id: "a2" });
    expect(convertedQuoteSchedule("project", quote, [{ id: "qa1", stage_id: "q1" }], [stage]).issues).toEqual(["Design"]);
  });
  it("preserves legitimately repeated allocations in retainer month children", () => {
    const parent = live({ stage_kind: "retainer_monthly", allocations: [] });
    const child1 = live({ id: "month1", source_quote_stage_id: null, parent_stage_id: "p1", stage_kind: "retainer_month" });
    child1.allocations[0].stage_id = "month1";
    const child2 = live({ id: "month2", source_quote_stage_id: null, parent_stage_id: "p1", stage_kind: "retainer_month" });
    child2.allocations[0].stage_id = "month2"; child2.allocations[0].id = "a2";
    const result = convertedQuoteSchedule("project", quote, [{ id: "qa1", stage_id: "q1" }], [parent, child1, child2]);
    expect(result.issues).toEqual([]);
    expect(result.stages[0].allocations.map(a => [a.id, a.stage_id])).toEqual([["a1", "month1"], ["a2", "month2"]]);
  });
  it("places the live retainer band after ordinary phases without changing live data", () => {
    const stages = [live({ stage_kind: "retainer_monthly", allocations: [] }), live({ id: "p2", source_quote_stage_id: "q2", allocations: [] })];
    const result = convertedQuoteSchedule("project", [...quote, { id: "q2", name: "Construction", sort_order: 20 }], [], stages);
    expect(result.stages[0].sort_order).toBe(21);
    expect(result.stages[1].sort_order).toBe(20);
    expect(stages[0].sort_order).toBe(99);
  });
});