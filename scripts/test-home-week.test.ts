import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homeWeekAccess, nextWeekStatus, personalHomeWeek } from "../src/lib/projects/home-week";
import { mondayOf, type BoardData } from "../src/lib/projects/week-board";

const week = "2026-10-19";
const data = (): BoardData => ({
  resources: [{ id: "own", name: "Own", collaborator_id: "me", weekly_capacity: 40, color: null }, { id: "other", name: "Other", collaborator_id: "them", weekly_capacity: 40, color: null }],
  projects: [{ id: "p", name: "Copied project", client: null }],
  stages: [{ id: "s", project_id: "p", name: "Design", parent_stage_id: "parent", sort_order: 0, start_date: week, end_date: "2026-10-23", stage_kind: null, is_milestone: false, is_self: false }],
  stage_tree: [{ id: "parent", project_id: "p", name: "Architecture", parent_stage_id: null, sort_order: 0 }, { id: "s", project_id: "p", name: "Design", parent_stage_id: "parent", sort_order: 0 }],
  allocations: [{ id: "a", resource_id: "own", stage_id: "s", project_id: "p", start_date: week, end_date: "2026-10-23", hours_per_day: 6, day_part: "full", is_site_visit: false, status: "committed", is_locked: false, source: null }],
  leave: [], plan: { id: "plan", status: "approved", approved_at: "2026-10-18T11:00:00Z", approved_by: "planner", updated_at: "2026-10-18T11:00:00Z", updated_by_name: null, notes: [] }, draft_slots: [], my_collaborator_id: "me",
});

describe("homepage weekly plan", () => {
  it("shows precisely Monday–Friday AM/PM with numbered project stage", () => {
    const result = personalHomeWeek(data(), week);
    assert.equal(result.approved, true);
    assert.deepEqual(result.days.map(d => d.day), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    for (const day of result.days) { assert.equal(day.am?.project, "Copied project"); assert.equal(day.pm?.stage, "1.1 Design"); }
  });
  it("never shows another collaborator's slots", () => { const d = data(); d.allocations[0].resource_id = "other"; assert.equal(personalHomeWeek(d, week).days.filter(d => d.am || d.pm).length, 0); });
  it("does not match unlinked resources when the caller has no collaborator", () => { const d = data(); d.my_collaborator_id = null; d.resources[0].collaborator_id = null; assert.equal(personalHomeWeek(d, week).days.filter(d => d.am || d.pm).length, 0); });
  it("shows no planned assignments without an approval even when Gantt or drafts exist", () => { const d = data(); d.plan = null; d.draft_slots = [{ resource_id: "own", day: week, part: "am", project_id: "p", stage_id: "s", is_site_visit: false }]; const r = personalHomeWeek(d, week); assert.equal(r.approved, false); assert.equal(r.days.filter(d => d.am || d.pm).length, 0); });
  it("keeps the published allocation plan during a revision instead of showing draft slots", () => { const d = data(); if (d.plan) d.plan.status = "draft"; d.draft_slots = [{ resource_id: "own", day: week, part: "am", project_id: "secret", stage_id: "s", is_site_visit: false }]; assert.equal(personalHomeWeek(d, week).days[0].am?.project, "Copied project"); });
  it("shows leave, public holidays and office closures even without an approved plan", () => {
    const d = data(); d.plan = null; d.leave = [{ resource_id: "own", day: week, kind: "leave", name: null }, { resource_id: "own", day: "2026-10-20", kind: "holiday", name: "Public holiday" }, { resource_id: "own", day: "2026-10-21", kind: "leave", name: null }, { resource_id: "own", day: "2026-10-21", kind: "holiday", name: "Office closure" }];
    const r = personalHomeWeek(d, week); assert.equal(r.days[0].nonWorking[0].kind, "leave"); assert.equal(r.days[1].nonWorking[0].name, "Public holiday"); assert.deepEqual(r.days[2].nonWorking.map(l => l.name), [null, "Office closure"]);
  });
  it("non-working days suppress both booked half-days", () => { const d = data(); d.leave = [{ resource_id: "own", day: week, kind: "holiday", name: "Holiday" }]; const day = personalHomeWeek(d, week).days[0]; assert.equal(day.am, null); assert.equal(day.pm, null); });
  it("zero-hour assignments never invent a planned half-day", () => { const d = data(); d.allocations[0].hours_per_day = 0; assert.equal(personalHomeWeek(d, week).days.filter(d => d.am || d.pm).length, 0); });
  it("staff see the card but only all-scope planners get next-week controls", () => { assert.deepEqual(homeWeekAccess(true, false, false, false), { visible: true, planner: false }); assert.equal(homeWeekAccess(true, false, false, true).planner, true); assert.equal(homeWeekAccess(true, false, true, false).planner, true); assert.equal(homeWeekAccess(true, true, true, true).planner, false); assert.deepEqual(homeWeekAccess(false, false, true, true), { visible: false, planner: false }); });
  it("next-week status distinguishes no draft, draft and approved", () => { assert.equal(nextWeekStatus({ plan: null }), "noDraft"); const d = data(); assert.equal(nextWeekStatus(d), "approved"); if (d.plan) d.plan.status = "draft"; assert.equal(nextWeekStatus(d), "draft"); });
  it("current and next-week links use Monday boundaries, including Sunday", () => { assert.equal(mondayOf("2026-10-18"), "2026-10-12"); assert.equal(mondayOf("2026-10-19"), "2026-10-19"); assert.equal(mondayOf("2026-10-25"), "2026-10-19"); });
});