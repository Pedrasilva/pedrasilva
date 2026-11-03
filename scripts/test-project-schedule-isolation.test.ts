import { describe, it, expect } from "vitest";
import { buildProjectGanttTree } from "../src/lib/projects/build-project-gantt-tree";
import { projectClientName } from "../src/lib/projects/project-client-name";
import type { StageWithAllocations } from "../src/lib/projects/types";

describe("operational schedule rules", () => {
  it("renders client approval as its own resizable live stage rather than architecture", () => {
    const stage = { id: "live-approval", project_id: "project", stage_role: "client", start_date: "2026-12-02", end_date: "2026-12-09", sort_order: 1, parent_stage_id: null, allocations: [], budget: 0 } as StageWithAllocations;
    const result = buildProjectGanttTree([stage], "project", "Project");
    expect(result.hierarchy.get("live-approval")?.role).toBe("client");
    expect(result.mappedStages.find(s => s.id === "live-approval")?.end_date).toBe("2026-12-09");
  });
  it("shows SMILEPROVIDER when conversion stored company but no legacy client text", () => {
    expect(projectClientName("SMILEPROVIDER, LDA", null)).toBe("SMILEPROVIDER, LDA");
    expect(projectClientName(null, null)).toBeNull();
  });
});