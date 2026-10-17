import { describe, it, expect } from "vitest";
import { boardColumns, visibleOpportunities, shownTotal } from "../src/lib/crm/pipeline-board";
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
    expect(hidden.find((c) => c.stage === "negotiation")!.items.map((o) => o.id)).toEqual(["neg"]);
    const shown = boardColumns(STAGES, opps, converted, true);
    expect(shown.flatMap((c) => c.items.filter((o) => o.id === "costa").map(() => c.stage))).toEqual(["lost"]);
  });
  it("won and converted leaves the board; won not converted stays", () => {
    const won = boardColumns(STAGES, opps, converted, false).find((c) => c.stage === "won")!;
    expect(won.items.map((o) => o.id)).toEqual(["wonOpen"]);
    expect(visibleOpportunities(opps, converted, true).map((o) => o.id)).toContain("wonConv");
  });
  it("totals count only what is shown", () => {
    expect(shownTotal(visibleOpportunities(opps, converted, false))).toBe(7000);
    expect(boardColumns(STAGES, opps, converted, false).find((c) => c.stage === "won")!.total).toBe(2000);
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
});
