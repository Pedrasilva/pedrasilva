import { describe, expect, it } from "vitest";
import { amountSeg, documentFileName, entityFolderName, safeSeg, statementFileName } from "../src/lib/finance/contabilidade-export.server";
import { processedName } from "../src/lib/finance/drive-intake.server";

describe("Contabilidade naming", () => {
  it("builds <date>_<counterparty>_<number>_<amount>", () => {
    expect(documentFileName({ issue_date: "2026-07-29", counterparty: "Lovable Labs Inc.", number: "2467-9126", total: 300, ext: "pdf" }))
      .toBe("2026-07-29_Lovable Labs Inc._2467-9126_300,00EUR.pdf");
  });
  it("is filesystem-safe", () => {
    expect(safeSeg('Águas/Lisboa: "SA"')).toBe("Aguas Lisboa SA");
    expect(safeSeg("")).toBe("sem-nome");
    expect(amountSeg(23.49)).toBe("23,49EUR");
  });
  it("names statements <YYYY-MM>_<conta>_extrato_<n>", () => {
    expect(statementFileName("2026-06", "MBCP Ordem", "extrato", "006/2026", "pdf")).toBe("2026-06_MBCP Ordem_extrato_006 2026.pdf");
  });
  it("maps entities to PSA or Pedra Rioja", () => {
    expect(entityFolderName("Pedra Rioja")).toBe("Pedra Rioja");
    expect(entityFolderName("PSA")).toBe("PSA");
  });
  it("names Processed files <date>_<Entrada ref>_<original>", () => {
    expect(processedName("1a2b3c4d-0000-0000-0000-000000000000", "30_09_Apple_23.49.pdf", new Date("2026-10-23T12:00:00Z")))
      .toBe("2026-10-23_E-1A2B3C4D_30_09_Apple_23.49.pdf");
  });
});
