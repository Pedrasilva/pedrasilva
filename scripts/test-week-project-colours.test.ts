import { describe, it, expect } from "vitest";
import { weekProjectColours } from "../src/lib/projects/week-project-colours";
describe("weekly board project colours", () => {
  it("gives every project a different colour, keeping unique custom ones", () => {
    const m = weekProjectColours([
      { id: "a", name: "A", color: "#3b82f6" }, { id: "b", name: "B", color: "#3b82f6" },
      { id: "c", name: "C", color: "#123456" }, { id: "d", name: "D", color: null },
    ]);
    expect(m.get("c")).toBe("#123456");
    expect(new Set(m.values()).size).toBe(4);
  });
});
