import { describe, it, expect } from "vitest";
import { decideAlerts, workingHoursBefore, isWorkingDay } from "../src/lib/finance/intake-health.server";
import { itemsFound } from "../src/lib/finance/intake-health";

const run = (ok: boolean, items = 0) => ({ ok, items, ran_at: "2026-10-20T10:00:00Z", error: ok ? null : "boom" });
const wed = new Date("2026-10-21T10:00:00Z"); // Wednesday in Lisbon
const sat = new Date("2026-10-24T10:00:00Z");

describe("intake source alerts", () => {
  it("3 failed runs in a row alert", () => expect(decideAlerts(wed, [run(false), run(false), run(false)], null, 1)).toEqual(["failures"]));
  it("2 failures then a success do not alert", () => expect(decideAlerts(wed, [run(false), run(false), run(true)], null, 1)).toEqual([]));
  it("nothing for 48 working hours on a working day alerts", () =>
    expect(decideAlerts(wed, [run(true)], "2026-10-01T00:00:00Z", 0)).toEqual(["silence"]));
  it("no silence alert on a weekend", () => expect(decideAlerts(sat, [run(true)], "2026-10-01T00:00:00Z", 0)).toEqual([]));
  it("no silence alert before 48 working hours of history", () =>
    expect(decideAlerts(wed, [run(true)], "2026-10-20T12:00:00Z", 0)).toEqual([]));
  it("48 working hours from Monday 10:00 reach back over the weekend to Thursday 10:00", () => {
    const mon = new Date("2026-11-09T10:00:00Z");
    expect(isWorkingDay(mon)).toBe(true);
    expect(workingHoursBefore(mon, 48).toISOString()).toBe("2026-11-05T10:00:00.000Z");
  });
  it("items found per source", () => {
    expect(itemsFound("docs", { queued: 2, mt940Imported: 1, duplicates: 5 })).toBe(3);
    expect(itemsFound("drive", { queued: 1 })).toBe(1);
    expect(itemsFound("ideas", { created: 1, answered: 1 })).toBe(2);
  });
});
