import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveSlots, dailyHours, PLAN_UTILISATION, resourceSlotCounts, type BoardAllocation } from "../src/lib/projects/week-board";

const week = "2026-10-19";
const allocation = (patch: Partial<BoardAllocation> = {}): BoardAllocation => ({ id: "a", resource_id: "r", stage_id: "s", project_id: "Mastercard", start_date: week, end_date: "2026-10-23", hours_per_day: 6, day_part: null, is_site_visit: false, status: "committed", is_locked: false, source: null, ...patch });
const derive = (rows: BoardAllocation[]) => deriveSlots(rows, week, { r: 8 }, [] ).r;
describe("weekly planning rules", () => {
  it("uses 75% utilisation and capacity / 5 with 8h fallback", () => { assert.equal(PLAN_UTILISATION, 0.75); assert.equal(dailyHours({ weekly_capacity: 20 }), 4); assert.equal(dailyHours({ weekly_capacity: null }), 8); });
  it("fills ten inferred slots from a full-week legacy 6h allocation", () => { const d = derive([allocation()]); assert.equal(resourceSlotCounts(d).booked, 10); assert.equal(d[week].am?.inferred, true); });
  it("derives Ricardo's exact five-day project sequence", () => {
    const d = derive([allocation({ end_date: "2026-10-20" }), allocation({ id: "b", project_id: "BCG", start_date: "2026-10-21", end_date: "2026-10-21" }), allocation({ id: "c", start_date: "2026-10-22", end_date: "2026-10-22" }), allocation({ id: "d", project_id: "Banco CTT", start_date: "2026-10-23" })]);
    assert.deepEqual(Object.values(d).map(v => [v.am?.projectId, v.pm?.projectId]), ["Mastercard", "Mastercard", "BCG", "Mastercard", "Banco CTT"].map(p => [p,p]));
  });
  it("preserves mixed explicit AM/PM and site visit", () => { const d = derive([allocation({ day_part: "am", hours_per_day: 3 }), allocation({ id: "b", day_part: "pm", project_id: "BCG", hours_per_day: 3, is_site_visit: true })]); assert.equal(d[week].am?.projectId, "Mastercard"); assert.equal(d[week].pm?.projectId, "BCG"); assert.equal(d[week].pm?.isSiteVisit, true); assert.equal(d[week].pm?.inferred, false); });
  for (const [hours, slots] of [[6,2],[3,1],[8,2],[1,0]] as const) it(`legacy ${hours}h produces ${slots} halves per day`, () => { const d = derive([allocation({ hours_per_day: hours })]); assert.equal(resourceSlotCounts(d).booked, slots * 5); if (!slots) assert.equal(d[week].otherHours, 1); });
  it("fills overlapping half-days largest first, AM before PM", () => { const d = derive([allocation({ hours_per_day: 2 }), allocation({ id: "b", hours_per_day: 3, project_id: "BCG" })]); assert.equal(d[week].am?.projectId, "BCG"); assert.equal(d[week].pm?.projectId, "Mastercard"); });
  it("keeps overload projects rather than hiding a third booking", () => { const d = derive([allocation(), allocation({ id: "b", project_id: "BCG", hours_per_day: 3 })]); assert.equal(d[week].overload[0]?.projectId, "BCG"); });
  it("excludes approved leave and holidays from denominator and slots", () => { const d = deriveSlots([allocation()], week, { r:8 }, [{ resource_id: "r", day: week, kind: "leave", name: null },{ resource_id: "r", day: "2026-10-20", kind: "holiday", name: "Holiday" }]).r; assert.deepEqual(resourceSlotCounts(d), { available:6, booked:6, free:0 }); assert.equal(d[week].am, null); });
  it("never generates weekend slots", () => { assert.equal(Object.keys(derive([allocation({ end_date:"2026-10-25" })])).length, 5); });
  it("20h part-timer gets full day from 3h and half from 1.5h", () => { const full = deriveSlots([allocation({ hours_per_day:3 })], week, { r:4 }, []).r; const half = deriveSlots([allocation({ hours_per_day:1.5 })], week, { r:4 }, []).r; assert.equal(resourceSlotCounts(full).booked, 10); assert.equal(resourceSlotCounts(half).booked, 5); });
});