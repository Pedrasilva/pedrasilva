import { describe, expect, it } from "vitest";
import { storyReadDue } from "../src/lib/marketing/instagram-insights";
import { syncStoryInsightsIfDue } from "../src/lib/marketing/instagram-insights.server";

const P = "2026-10-22T10:00:00Z";
const at = (h: number) => new Date(Date.parse(P) + h * 3600_000);
describe("story insight timing", () => {
  it("nothing before 20 h", () => expect(storyReadDue(P, null, at(19.9))).toBeNull());
  it("mid read at 20–23 h, once", () => {
    expect(storyReadDue(P, null, at(20.5))).toBe("mid");
    expect(storyReadDue(P, at(20.5).toISOString(), at(21))).toBeNull();
  });
  it("final read at 23–24 h even after a mid read", () => {
    expect(storyReadDue(P, at(21).toISOString(), at(23.2))).toBe("final");
    expect(storyReadDue(P, at(23.2).toISOString(), at(23.6))).toBeNull();
  });
  it("nothing after expiry", () => expect(storyReadDue(P, null, at(24.1))).toBeNull());
});

describe("story sync (mocked Graph, GET only)", () => {
  it("reads due Stories, skips deprecated metrics, stores a STORY snapshot", async () => {
    const calls: Array<{ path: string; post: boolean }> = [];
    const graph = async (path: string, fields?: unknown) => {
      calls.push({ path, post: !!fields });
      if (path.startsWith("ig/stories")) return { data: [{ id: "s2", media_type: "IMAGE", timestamp: at(1).toISOString() }] };
      if (path.startsWith("s1/insights")) {
        if (path.includes(",")) { const e: any = new Error("bad"); throw Object.assign(e, { code: "100" }); }
        if (path.includes("navigation")) { const e: any = new Error("deprecated"); throw Object.assign(e, { code: "100" }); }
        return { data: [{ name: path.split("metric=")[1], values: [{ value: 7 }] }] };
      }
      throw new Error("unexpected " + path);
    };
    const writes: any[] = [];
    const table = (name: string) => {
      const q: any = {
        select: () => q, eq: () => q, not: () => q,
        gte: () => Promise.resolve({ data: name === "marketing_post_drafts" ? [{ id: "d1", ig_media_id: "s1", published_at: P }] : [] }),
        in: () => Promise.resolve({ data: [] }),
        single: () => Promise.resolve({ data: { instagram_account_id: "ig" } }),
        upsert: (row: any) => { writes.push(row); return Promise.resolve({ error: null }); },
      };
      return q;
    };
    const { InstagramError } = await import("../src/lib/marketing/instagram-graph.server");
    const wrapped = async (p: string, f?: unknown) => { try { return await graph(p, f); } catch (e: any) { if (e.code) throw new InstagramError(e.message, e.code); throw e; } };
    const r = await syncStoryInsightsIfDue({ graph: wrapped as any, db: { from: table }, now: at(21) });
    expect(r).toEqual({ stories: 2, read: 1 });
    expect(calls.every((c) => !c.post)).toBe(true);
    expect(writes[0]).toMatchObject({ media_id: "s1", media_product_type: "STORY", draft_id: "d1", metrics: { reach: 7 } });
    expect(writes[0].unavailable_metrics).toContain("navigation");
  });
});
