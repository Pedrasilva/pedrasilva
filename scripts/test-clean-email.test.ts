import { describe, expect, it } from "vitest";
import { cleanEmailBody } from "../src/lib/marketing/clean-email";

describe("cleanEmailBody", () => {
  it("removes the Pedra Silva signature and disclaimer", () => {
    const raw = "Subject: Chipping away\n\n*Luis Pedra Silva*\n*FOUNDER & ARCHITECT*\n*+351 919 743 531*\n*Travessa Corpo Santo 10, 1ºD*\nThis e-mail transmission is confidential";
    expect(cleanEmailBody(raw)).toBe("Subject: Chipping away");
  });
  it("keeps the body and drops a quoted reply", () => {
    const raw = "Subject: Obra\nFotos da obra de hoje.\n\nOn Mon, 20 Oct 2026, Ana <ana@x.pt> wrote:\n> antigo";
    expect(cleanEmailBody(raw)).toBe("Subject: Obra\nFotos da obra de hoje.");
  });
  it("drops a Portuguese quoted reply", () => {
    expect(cleanEmailBody("Olá\nEm seg., 20/10/2026, Rui escreveu:\n> x")).toBe("Olá");
  });
});
