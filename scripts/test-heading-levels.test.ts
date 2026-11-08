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
});
