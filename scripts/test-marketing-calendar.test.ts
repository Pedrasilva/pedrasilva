import { describe, expect, it } from "vitest";
import { gridOrder, lisbonParts, lisbonToUtcIso, lowWeeks, mondayOf, repetitionWarnings, type CalendarPost } from "../src/lib/marketing/calendar";

const post = (id: string, at: string, o: Partial<CalendarPost> = {}): CalendarPost => ({ id, at, pillar: null, persona: null, projectId: null, ...o });

describe("Lisbon time", () => {
  it("summer time is UTC+1", () => expect(lisbonToUtcIso("2026-07-01", "10:00")).toBe("2026-07-01T09:00:00.000Z"));
  it("winter time is UTC+0", () => expect(lisbonToUtcIso("2026-11-02", "10:00")).toBe("2026-11-02T10:00:00.000Z"));
  it("round-trips", () => expect(lisbonParts("2026-07-01T09:00:00.000Z")).toEqual({ date: "2026-07-01", time: "10:00" }));
  it("late evening UTC belongs to the Lisbon next day in summer", () => expect(lisbonParts("2026-07-01T23:30:00.000Z").date).toBe("2026-07-02"));
});

describe("weekly target of 3 posts", () => {
  it("flags a week with 2 posts and not one with 3", () => {
    const posts = [post("a", lisbonToUtcIso("2026-11-02", "10:00")), post("b", lisbonToUtcIso("2026-11-04", "10:00")),
      post("c", lisbonToUtcIso("2026-11-09", "10:00")), post("d", lisbonToUtcIso("2026-11-10", "10:00")), post("e", lisbonToUtcIso("2026-11-15", "10:00"))];
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(lowWeeks(posts, ["2026-11-02", "2026-11-09"])).toEqual([{ week: "2026-11-02", count: 2 }]);
  });
});

describe("repetition warnings", () => {
  it("same pillar two posts in a row", () => {
    const w = repetitionWarnings([post("a", "2026-11-02T10:00:00Z", { pillar: "Obra" }), post("b", "2026-11-03T10:00:00Z", { pillar: "Obra" })]);
    expect(w).toEqual([{ postId: "b", field: "pillar", value: "Obra", kind: "consecutive" }]);
  });
  it("same project three times in 7 days, not consecutive", () => {
    const w = repetitionWarnings([
      post("a", "2026-11-02T10:00:00Z", { projectId: "p" }), post("x", "2026-11-03T10:00:00Z", { projectId: "q" }),
      post("b", "2026-11-04T10:00:00Z", { projectId: "p" }), post("y", "2026-11-05T10:00:00Z", { projectId: "q" }),
      post("c", "2026-11-06T10:00:00Z", { projectId: "p" }),
    ]);
    expect(w).toEqual([{ postId: "c", field: "project", value: "p", kind: "window" }]);
  });
  it("twice in 7 days is fine", () => {
    expect(repetitionWarnings([post("a", "2026-11-02T10:00:00Z", { persona: "Cliente" }), post("x", "2026-11-03T10:00:00Z"), post("b", "2026-11-04T10:00:00Z", { persona: "Cliente" })])).toEqual([]);
  });
});

describe("grid order", () => {
  it("undated approved first, then latest scheduled at top", () => {
    const rows = [
      { id: "1", status: "scheduled", scheduled_at: "2026-11-02T10:00:00Z", created_at: "2026-10-01" },
      { id: "2", status: "approved", scheduled_at: null, created_at: "2026-10-02" },
      { id: "3", status: "scheduled", scheduled_at: "2026-11-09T10:00:00Z", created_at: "2026-10-03" },
    ];
    expect(gridOrder(rows).map((r) => r.id)).toEqual(["2", "3", "1"]);
  });
});
