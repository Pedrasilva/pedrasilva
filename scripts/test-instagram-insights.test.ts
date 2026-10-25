import { describe, expect, it } from "vitest";
import { buildAnalysisInput, collectMetrics, formatOf, groupBy, metricSet, parseAnalysis, parseInsights, type PostRow } from "../src/lib/marketing/instagram-insights";
import { syncInstagramInsights } from "../src/lib/marketing/instagram-insights.server";
import { InstagramError } from "../src/lib/marketing/instagram-graph.server";

const code = (e: unknown) => (e instanceof InstagramError ? e.code : "x");

describe("instagram insights", () => {
  it("parses values and total_value shapes", () => {
    expect(parseInsights({ data: [{ name: "reach", values: [{ value: 120 }] }, { name: "views", total_value: { value: 300 } }] })).toEqual({ reach: 120, views: 300 });
  });
  it("classifies formats and picks reel metrics", () => {
    expect(formatOf("CAROUSEL_ALBUM", "FEED")).toBe("carousel");
    expect(formatOf("VIDEO", "REELS")).toBe("reel");
    expect(formatOf("IMAGE", "STORY")).toBe("story");
    expect(metricSet("REELS", "VIDEO")).toContain("ig_reels_avg_watch_time");
  });
  it("skips deprecated metrics instead of failing", async () => {
    const r = await collectMetrics(async (ms) => {
      if (ms.includes("follows")) throw new InstagramError("unsupported", "100");
      return { data: ms.map((m) => ({ name: m, values: [{ value: 1 }] })) };
    }, ["reach", "follows"], code);
    expect(r.metrics).toEqual({ reach: 1 });
    expect(r.unavailable).toEqual(["follows"]);
  });
  it("does not hide non-metric errors", async () => {
    await expect(collectMetrics(async () => { throw new InstagramError("down", "500", true); }, ["reach"], code)).rejects.toThrow("down");
  });
  it("analysis input has no commenter data and masks mentions", () => {
    const posts: PostRow[] = [{ media_id: "1", captured_on: "2026-10-22", media_type: "IMAGE", media_product_type: "FEED", caption: "Thanks @someone", posted_at: "2026-10-20T09:00:00Z", draft_id: null, metrics: { reach: 100, likes: 10 } }];
    const inp = buildAnalysisInput(posts, [{ id: "d", ig_media_id: "1", project_id: "p", project_name: "Casa X", pillar: "process" }], []);
    const s = JSON.stringify(inp);
    expect(s).not.toContain("someone");
    expect(s).not.toMatch(/username|token|instagram_account_id/);
    expect(inp.byPillar[0].key).toBe("process");
  });
  it("groups averages", () => {
    const g = groupBy([{ metrics: { reach: 100 } }, { metrics: { reach: 300 } }] as PostRow[], () => "a");
    expect(g[0].avgReach).toBe(200);
  });
  it("requires 3-5 recommendations", () => {
    expect(() => parseAnalysis('{"working":[],"notWorking":[],"recommendations":["a"]}')).toThrow();
    expect(parseAnalysis('x {"working":["w"],"notWorking":[],"recommendations":["1","2","3","4","5","6"]}').recommendations).toHaveLength(5);
  });
  it("sync uses GET only and stores daily snapshots (mocked Graph)", async () => {
    const calls: Array<{ path: string; post: boolean }> = [];
    const graph = async (path: string, fields?: Record<string, string>) => {
      calls.push({ path, post: !!fields });
      if (path.startsWith("ig/media")) return { data: [{ id: "m1", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-20T10:00:00Z" }] };
      if (path.startsWith("ig/stories")) return { data: [] };
      if (path.startsWith("m1/insights")) return { data: [{ name: "reach", values: [{ value: 50 }] }] };
      if (path === "ig?fields=followers_count") return { followers_count: 900 };
      if (path.startsWith("ig/insights")) return { data: [{ name: "reach", total_value: { value: 400 } }] };
      throw new Error("unexpected " + path);
    };
    const writes: Record<string, any[]> = {};
    const table = (name: string) => {
      const q: any = {
        select: () => q, eq: () => q, in: () => Promise.resolve({ data: [] }),
        single: () => Promise.resolve({ data: { instagram_account_id: "ig" } }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        upsert: (row: any) => { (writes[name] ??= []).push(row); return Promise.resolve({ error: null }); },
        update: (row: any) => { (writes[name] ??= []).push(row); return q; },
      };
      return q;
    };
    const r = await syncInstagramInsights({ graph: graph as any, db: { from: table }, now: new Date("2026-10-23T09:00:00Z") });
    expect(r).toMatchObject({ posts: 1, account: true, error: null });
    expect(calls.every((c) => !c.post)).toBe(true);
    expect(writes.marketing_ig_media_insights[0]).toMatchObject({ media_id: "m1", captured_on: "2026-10-23", metrics: { reach: 50 } });
    expect(writes.marketing_ig_account_insights[0]).toMatchObject({ followers: 900, metrics: { reach: 400 } });
  });
});
