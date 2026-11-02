import { describe, expect, it } from "vitest";
import { relativeProgrammeRows, relativeProgrammeTiming } from "../src/lib/psa-proposal/relative-programme";

describe("proposal-owned relative programme", () => {
  it("retains execution weeks 8–12 as five weeks, without calendar dates", () => {
    const rows = relativeProgrammeRows([{ stageId: "execution-fixture", label: "Execution", unit: "week", start: 8, end: 12, durationLabel: "5 semanas" }]);
    expect(rows[0]?.end - rows[0]?.start + 1).toBe(5);
    expect(relativeProgrammeTiming(rows[0], "pt-PT")).toBe("Semana 8–12");
  });
  it("retains four construction months, independent of stored year anchors", () => {
    const rows = relativeProgrammeRows([{ stageId: "assistance-fixture", label: "Assistance", unit: "constructionMonth", start: 1, end: 4, durationLabel: "4 meses" }]);
    expect(rows[0]?.end).toBe(4);
    expect(relativeProgrammeTiming(rows[0], "pt-PT")).toBe("Mês 1–4 de obra");
  });
  it("does not opt other proposals into an override", () => {
    expect(relativeProgrammeRows(undefined)).toEqual([]);
    expect(relativeProgrammeRows([{ unit: "date", start: 2000, end: 2027 }])).toEqual([]);
  });
});