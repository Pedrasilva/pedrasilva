import { describe, expect, it } from "vitest";
import { isGeneratedProjectQuote, liveStageIdentityIssues } from "../src/lib/projects/project-provenance";

describe("direct project provenance and live editing", () => {
  it("a reverse-generated BCG snapshot is not a converted source", () => {
    expect(isGeneratedProjectQuote({ notas: "Auto-generated from project Gantt" })).toBe(true);
  });
  it("missing acceptance in a legacy proposal does not erase its source", () => {
    expect(isGeneratedProjectQuote({ notas: null })).toBe(false);
  });
  it("an unavailable proposal does not establish direct provenance", () => {
    expect(isGeneratedProjectQuote(undefined)).toBe(false);
  });
  it("live stages with optional null roles are editable without proposal mapping", () => {
    expect(liveStageIdentityIssues([{ id: "live-a", name: "Concept", source_quote_stage_id: "quote-a" }, { id: "live-b", name: "Added stage" }])).toEqual([]);
  });
  it("ambiguous source identities still block editing", () => {
    expect(liveStageIdentityIssues([{ id: "live-a", name: "A", source_quote_stage_id: "same" }, { id: "live-b", name: "B", source_quote_stage_id: "same" }])).toEqual(["A", "B"]);
  });
});