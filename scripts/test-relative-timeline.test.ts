import { describe, expect, it } from "vitest";
import { relativeWeekLabel, formatDatePT } from "@/lib/psa-proposal/live-data";

describe("proposal relative timeline labels", () => {
  it("first relative day is Week 1", () => {
    expect(relativeWeekLabel("2000-01-03", "pt-PT")).toBe("Semana 1");
  });
  it("30 working days end in Week 6", () => {
    expect(relativeWeekLabel("2000-02-11", "pt-PT")).toBe("Semana 6");
    expect(relativeWeekLabel("2000-02-14", "en")).toBe("Week 7");
  });
  it("real calendar dates keep showing as dates", () => {
    expect(relativeWeekLabel("2026-10-19")).toBeNull();
    expect(formatDatePT("2026-10-19")).not.toContain("Semana");
  });
});
