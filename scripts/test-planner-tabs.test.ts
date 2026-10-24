import { describe, expect, it } from "vitest";
import { asPlannerTab, inTab, tabCounts, tabOf } from "../src/lib/marketing/planner-tabs";

describe("planner tabs", () => {
  it("To review = suggested + pending_approval + failed", () => {
    expect(["suggested", "pending_approval", "failed"].map((status) => tabOf({ status }))).toEqual(["review", "review", "review"]);
  });
  it("approved without date is Approved, scheduled/publishing is Scheduled", () => {
    expect(tabOf({ status: "approved", scheduled_at: null })).toBe("approved");
    expect(tabOf({ status: "scheduled" })).toBe("scheduled");
    expect(tabOf({ status: "publishing" })).toBe("scheduled");
  });
  it("an approved post leaves To review", () => expect(inTab({ status: "approved" }, "review")).toBe(false));
  it("defaults to To review for unknown ?tab", () => expect(asPlannerTab("xyz")).toBe("review"));
  it("counts", () => {
    const c = tabCounts([{ status: "suggested" }, { status: "approved" }, { status: "rejected" }, { status: "failed" }]);
    expect(c).toMatchObject({ review: 2, approved: 1, rejected: 1, all: 4, published: 0 });
  });
});
