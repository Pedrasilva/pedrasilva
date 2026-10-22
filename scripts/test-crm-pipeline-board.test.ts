import { describe, it, expect } from "vitest";
import { boardColumns, visibleOpportunities, shownTotal, opportunityOverview } from "../src/lib/crm/pipeline-board";
import { opportunityProjects, activeProjectOpportunities, canConvertOpportunity } from "../src/lib/crm/opportunity-projects";
import { resolveOpportunityValueWithSource } from "../src/lib/crm/opportunity-value";
import { splitContactName } from "../src/lib/crm/contact-name";

const STAGES = ["lead", "proposal", "negotiation", "won", "lost"];
const sentQuote = { valor: 0, resolved_value: 12000, quote_status: "sent" };
const opps = [
  { id: "costa", stage: "lost", estimated_fee: 8000, quotes: [sentQuote] },
  { id: "neg", stage: "negotiation", estimated_fee: 5000, quotes: [] },
  { id: "wonConv", stage: "won", estimated_fee: 1000, quotes: [] },
  { id: "wonOpen", stage: "won", estimated_fee: 2000, quotes: [] },
];
const converted = new Set(["wonConv"]);

describe("CRM pipeline board", () => {
  it("lost opportunity with a sent quote appears once, only in Lost, and only with Show closed", () => {
    const hidden = boardColumns(STAGES, opps, converted, false);
    expect(hidden.flatMap((c) => c.items).filter((o) => o.id === "costa")).toHaveLength(0);
    expect(hidden.find((c) => c.stage === "negotiation")?.items.map((o) => o.id)).toEqual(["neg"]);
    const shown = boardColumns(STAGES, opps, converted, true);
    expect(shown.flatMap((c) => c.items.filter((o) => o.id === "costa").map(() => c.stage))).toEqual(["lost"]);
  });
  it("all Won leave the board; Show closed List retains converted and unconverted wins", () => {
    expect(boardColumns(STAGES, opps, converted, true).find((c) => c.stage === "won")).toBeUndefined();
    expect(visibleOpportunities(opps, converted, true).map((o) => o.id)).toContain("wonConv");
  });
  it("totals count only what is shown", () => {
    expect(shownTotal(visibleOpportunities(opps, converted, false))).toBe(5000);
  });
  it("value uses quoted total when a quote exists, else estimated fee", () => {
    expect(resolveOpportunityValueWithSource(opps[0])).toEqual({ value: 12000, source: "quoted" });
    expect(resolveOpportunityValueWithSource(opps[1])).toEqual({ value: 5000, source: "estimated" });
    expect(resolveOpportunityValueWithSource({ estimated_fee: 5000, quotes: [{ valor: 9000, archived_at: "x" }] })).toEqual({ value: 5000, source: "estimated" });
  });
  it("splits free-text contact names", () => {
    expect(splitContactName(" Kent  Tan ")).toEqual({ primeiro_nome: "Kent", apelido: "Tan" });
    expect(splitContactName("Kent")).toEqual({ primeiro_nome: "Kent", apelido: null });
  });
  for (const amount of [0, null, ""] as const) it(`falls back to Estimated for active quote total ${String(amount)}`, () => {
    const item = { id: "fallback", stage: "negotiation", estimated_fee: 5000, quotes: [{ valor: amount, resolved_value: amount }] };
    expect(resolveOpportunityValueWithSource(item)).toEqual({ value: 5000, source: "estimated" });
    expect(shownTotal([item])).toBe(5000);
    expect(boardColumns(STAGES, [item], new Set(), false).find(c => c.stage === "negotiation")?.total).toBe(5000);
  });
  it("detects conversion through direct, project quote and quote project links without duplication", () => {
    const links = opportunityProjects([
      { id: "p1", name: "CTT", status: "active", opportunity_id: "ctt", quote_id: "q1" },
      { id: "p2", name: "Uralchem", status: "paused", opportunity_id: null, quote_id: "q2" },
      { id: "p3", name: "CTR", status: "active", opportunity_id: null, quote_id: null },
    ], [
      { id: "q1", opportunity_id: "ctt", pm_project_id: "p1" },
      { id: "q2", opportunity_id: "uralchem", pm_project_id: null },
      { id: "q3", opportunity_id: "ctr", pm_project_id: "p3" },
    ]);
    expect(links.get("ctt")?.map(p => p.id)).toEqual(["p1"]);
    expect([...links.keys()]).toEqual(["ctt", "uralchem", "ctr"]);
  });
  it("Active projects excludes archived and includes active, paused and unconverted Won", () => {
    const links = opportunityProjects([
      { id: "p1", name: "2506", status: "archived", opportunity_id: "wonConv", quote_id: null },
      { id: "p2", name: "Paused", status: "paused", opportunity_id: "neg", quote_id: null },
    ], []);
    expect(activeProjectOpportunities(opps, links).map(o => o.id)).toEqual(["neg", "wonOpen"]);
    expect(visibleOpportunities(opps, new Set(links.keys()), true).map(o => o.id)).toContain("wonConv");
  });
  for (const stage of ["proposal", "negotiation", "won"]) it(`allows quote conversion for ${stage} but not already converted`, () => {
    const o = { id: "mint", stage, quotes: [{ id: "q1" }, { id: "q2" }] };
    expect(canConvertOpportunity(o, new Set())).toBe(true);
    expect(canConvertOpportunity(o, new Set(["mint"]))).toBe(false);
    expect(canConvertOpportunity({ ...o, quotes: [] }, new Set())).toBe(false);
  });
  it("Overview counts a won opportunity once and excludes wins from open/weighted pipeline", () => {
    const rows = opps.map(o => ({ ...o, probability: 50 }));
    const summary = opportunityOverview([...rows, rows[2]]);
    expect(summary.wonCount).toBe(2);
    expect(summary.wonValue).toBe(3000);
    expect(summary.totalOpen).toBe(5000);
    expect(summary.weightedPipeline).toBe(2500);
  });
});
