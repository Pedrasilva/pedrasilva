import { describe, expect, it } from "vitest";
import { summaryDepartments } from "../src/lib/hr/summary-departments";

describe("HR General summary department membership", () => {
  it("includes all 11 Projecto collaborators independent of display language or hybrid classification", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      collab: { departamento: "Projecto", resource_classification: i < 3 ? "hybrid" : "project" },
      cost: 100 + i,
    }));
    const result = summaryDepartments(rows);
    expect(result.projecto).toHaveLength(11);
    expect(result.projecto.reduce((sum, row) => sum + row.cost, 0)).toBe(1155);
  });
  it("keeps the single Backoffice collaborator and preserves the combined total", () => {
    const rows = [
      ...Array.from({ length: 11 }, () => ({ collab: { departamento: "Projecto" }, cost: 100 })),
      { collab: { departamento: "Backoffice" }, cost: 250 },
    ];
    const result = summaryDepartments(rows);
    expect(result.backoffice).toHaveLength(1);
    expect([...result.projecto, ...result.backoffice].reduce((sum, row) => sum + row.cost, 0)).toBe(1350);
  });
});