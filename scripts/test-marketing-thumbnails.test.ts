import { describe, it, expect } from "vitest";
import { signPaths } from "../src/lib/marketing/draft-images";
import { backfillCaptureThumbnails, thumbPathFor } from "../src/lib/marketing/thumbnails.server";

describe("whole-image previews", () => {
  it("requests contain at 400px and does not transform publishing originals", async () => {
    const calls: unknown[] = [];
    const sb = { storage: { from: () => ({
      createSignedUrl: async (_p: string, _ttl: number, options: unknown) => { calls.push(options); return { data: { signedUrl: "preview" } }; },
      createSignedUrls: async () => ({ data: [{ path: "photo.jpg", signedUrl: "original" }] }),
    }) } };
    expect((await signPaths(sb, [{ path: "photo.jpg" }], 3600, 400)).get("photo.jpg")).toBe("preview");
    expect(calls).toEqual([{ transform: { width: 400, quality: 70, resize: "contain" } }]);
    expect((await signPaths(sb, [{ path: "photo.jpg" }])).get("photo.jpg")).toBe("original");
    expect(calls).toHaveLength(1);
  });
  it("overwrite includes existing thumbnails rather than selecting missing only", async () => {
    let nullFilters = 0;
    const query = {
      select: () => query, like: () => query, is: () => { nullFilters++; return query; },
      order: () => query, limit: async () => ({ data: [], error: null }),
    };
    await backfillCaptureThumbnails({ from: () => query }, { overwrite: true });
    expect(nullFilters).toBe(0);
    await backfillCaptureThumbnails({ from: () => query });
    expect(nullFilters).toBe(1);
    expect(thumbPathFor({ id: "asset", capture_id: "capture" })).toBe("capture/thumb-v2-asset.webp");
  });
});