import { describe, expect, it } from "vitest";
import { parseSplitDrawers, splitDrawerStorageKey } from "../src/components/psa-composer/split-drawers";

describe("Split drawer preferences", () => {
  it("starts with both overlays closed", () => {
    expect(parseSplitDrawers(null)).toEqual({ library: false, settings: false });
  });
  it("restores each drawer independently", () => {
    expect(parseSplitDrawers('{"library":true,"settings":false}')).toEqual({ library: true, settings: false });
    expect(parseSplitDrawers('{"library":false,"settings":true}')).toEqual({ library: false, settings: true });
  });
  it("isolates different users' preferences", () => {
    expect(splitDrawerStorageKey("luis")).not.toBe(splitDrawerStorageKey("rita"));
  });
  it("rejects malformed or non-boolean preferences", () => {
    expect(parseSplitDrawers("invalid")).toEqual({ library: false, settings: false });
    expect(parseSplitDrawers('{"library":"true","settings":1}')).toEqual({ library: false, settings: false });
  });
});