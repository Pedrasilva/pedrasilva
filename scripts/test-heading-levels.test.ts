import { describe, expect, it } from "vitest";
import { blockHeadingLevel, computeSectionNumbers, type BlockHeadingLevel } from "../src/lib/psa-proposal/heading-levels";

type B = { title: string; level?: BlockHeadingLevel; numbered?: boolean };
const run = (blocks: B[]) =>
  computeSectionNumbers(blocks, {
    numbered: (b) => b.numbered !== false,
    level: (b) => blockHeadingLevel({ content_rich: b.level ? { headingLevel: b.level } : {} }),
    title: (b) => b.title,
  });

describe("block heading levels", () => {
  it("defaults existing blocks to H1", () => {
    expect(blockHeadingLevel({ content_rich: {} })).toBe("h1");
    expect(blockHeadingLevel({ content_rich: null })).toBe("h1");
  });
  it("numbers only H1 as sections when nothing is edited", () => {
    expect(run([{ title: "A" }, { title: "B" }, { title: "C" }]).chapters).toEqual(["1", "2", "3"]);
  });
  it("numbers H2 as sub-sections of the previous H1 and skips H3", () => {
    const r = run([{ title: "A" }, { title: "B", level: "h2" }, { title: "C", level: "h3" }, { title: "D", level: "h2" }, { title: "E" }]);
    expect(r.chapters).toEqual(["1", "1.1", null, "1.2", "2"]);
  });
  it("index lists H1 and H2 only", () => {
    const r = run([{ title: "A" }, { title: "B", level: "h2" }, { title: "C", level: "h3" }, { title: "D", level: "none" }]);
    expect(r.toc.map((e) => [e.chapter, e.level])).toEqual([["1", 1], ["1.1", 2]]);
  });
  it("leaves an H2 before any H1 unnumbered", () => {
    expect(run([{ title: "A", level: "h2" }, { title: "B" }]).chapters).toEqual([null, "1"]);
  });
  it("nests the five project stages under section 3", () => {
    const r = run([{ title: "Sobre a PSA" }, { title: "Âmbito" }, { title: "Organização do Projeto e Fases" }, ...["Programa", "Estudo Prévio", "Licenciamento", "Projecto de Execução", "Assistência Técnica"].map(title => ({ title, level: "h2" as const }))]);
    expect(r.chapters).toEqual(["1", "2", "3", "3.1", "3.2", "3.3", "3.4", "3.5"]);
    expect(r.toc.slice(3).map(e => [e.chapter, e.title, e.level])).toEqual([["3.1", "Programa", 2], ["3.2", "Estudo Prévio", 2], ["3.3", "Licenciamento", 2], ["3.4", "Projecto de Execução", 2], ["3.5", "Assistência Técnica", 2]]);
  });
});
