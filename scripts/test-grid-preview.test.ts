import { describe, it, expect } from "vitest";
import { buildGrid, neighboursAt, proposeBetween, reorder } from "../src/lib/marketing/grid-preview";

const NOW = new Date("2026-10-23T09:00:00Z");
const d = (id: string, status: string, at: string | null, created = "2026-10-01T00:00:00Z") => ({ id, status, scheduled_at: at, created_at: created });
describe("planner grid preview", () => {
  const drafts = [d("s1", "scheduled", "2026-10-25T10:00:00Z"), d("s2", "scheduled", "2026-10-27T10:00:00Z"), d("a1", "approved", null), d("p1", "pending_approval", null, "2026-10-02T00:00:00Z"), d("x", "suggested", null), d("r", "rejected", null)];
  const live = [{ id: "L1", timestamp: "2026-10-20T10:00:00Z" }, { id: "L2", timestamp: "2026-10-22T10:00:00Z" }];
  const ids = (o: string[] = []) => buildGrid(drafts, live, o).map((i) => (i.kind === "live" ? i.live.id : i.draft.id));
  it("newest first: undated drafts, then scheduled desc, then live desc; excludes suggested/rejected", () => {
    expect(ids()).toEqual(["p1", "a1", "s2", "s1", "L2", "L1"]);
  });
  it("respects the curator's order for undated drafts", () => {
    expect(ids(reorder(["p1", "a1"], "a1", "p1"))).toEqual(["a1", "p1", "s2", "s1", "L2", "L1"]);
  });
  it("dropping between two scheduled posts proposes the midpoint", () => {
    const items = buildGrid(drafts.filter((x) => x.id !== "a1"), live);
    const n = neighboursAt(items, 2); // before s1
    expect(n).toEqual({ newer: "2026-10-27T10:00:00Z", older: "2026-10-25T10:00:00Z" });
    expect(proposeBetween(n.newer, n.older, NOW)).toBe("2026-10-26T10:00:00.000Z");
  });
  it("between now and a live post the lower bound is now, never the past", () => {
    expect(proposeBetween("2026-10-25T09:00:00Z", "2026-10-22T10:00:00Z", NOW)).toBe("2026-10-24T09:00:00.000Z");
  });
  it("on top of everything proposes one day after the newest", () => {
    expect(proposeBetween(null, "2026-10-27T10:00:00Z", NOW)).toBe("2026-10-28T10:00:00.000Z");
  });
  it("no gap left returns null (nothing is changed)", () => {
    expect(proposeBetween("2026-10-23T09:05:00Z", "2026-10-23T09:00:00Z", NOW)).toBeNull();
  });
});
