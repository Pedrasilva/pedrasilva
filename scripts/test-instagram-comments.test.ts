import { describe, it, expect, vi } from "vitest";
import { instagramGraph } from "../src/lib/marketing/instagram-graph.server";
import { hideRequest, normalizeComments, replyRequest, isUnread } from "../src/lib/marketing/instagram-comments";
import { replyToComment, setCommentHidden, suggestCommentReply, syncInstagramComments } from "../src/lib/marketing/instagram-comments.server";

vi.mock("../src/lib/marketing/bible.server", () => ({ getActiveMarketingBible: async () => ({ content_md: "Calm, precise, warm.", version: 1, pillars: [], personas: [] }) }));

/** Tiny in-memory stand-in for the database client: records every write. */
function fakeDb(seed: Record<string, Record<string, unknown>[]>) {
  const writes: { table: string; op: string; row: unknown }[] = [];
  const db = {
    writes,
    from(table: string) {
      const rows = seed[table] ?? [];
      const q: Record<string, unknown> = {};
      let filter: [string, unknown] | null = null;
      Object.assign(q, {
        select: () => q, eq: (k: string, v: unknown) => { filter = [k, v]; return q; },
        single: async () => ({ data: rows[0] ?? null }), maybeSingle: async () => ({ data: filter ? rows.find((r) => r[filter![0]] === filter![1]) ?? null : rows[0] ?? null }),
        upsert: async (row: unknown) => { writes.push({ table, op: "upsert", row }); return { error: null }; },
        insert: async (row: unknown) => { writes.push({ table, op: "insert", row }); return { error: null }; },
        update: (row: unknown) => { writes.push({ table, op: "update", row }); return { eq: async () => ({ error: null }) }; },
      });
      return q;
    },
  };
  return db;
}
const mockFetch = (handler: (url: string, init: RequestInit) => unknown) => {
  const calls: { url: string; method: string; body: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body ? String(init.body) : "" });
    return new Response(JSON.stringify(handler(url, init)), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
};
const ACCOUNT = { instagram_account_id: "1789", instagram_feed: [{ id: "111", media_type: "CAROUSEL_ALBUM", media_url: "https://cdn/x.jpg", permalink: "https://instagram.com/p/x", caption: "Light study" }] };

describe("Instagram comments (mocked Meta)", () => {
  it("normalises comments and nested replies, flags our own replies", () => {
    const rows = normalizeComments(ACCOUNT.instagram_feed[0], [{ id: "c1", text: "Lindo!", username: "ana", timestamp: "2026-10-22T10:00:00+0000", replies: { data: [{ id: "c2", text: "Obrigado", username: "pedrasilva_arquitectos", from: { id: "1789" } }] } }], { id: "1789", username: "pedrasilva_arquitectos" });
    expect(rows.map((r) => [r.id, r.parent_id, r.from_us])).toEqual([["c1", null, false], ["c2", "c1", true]]);
    expect(rows[0].media_thumbnail).toBe("https://cdn/x.jpg");
    expect(isUnread({ from_us: false, read_at: null })).toBe(true);
    expect(isUnread({ from_us: true, read_at: null })).toBe(false);
  });
  it("sync only makes GET calls and stores rows", async () => {
    const { f, calls } = mockFetch(() => ({ data: [{ id: "17900000000000001", text: "Great", username: "joao" }] }));
    const db = fakeDb({ marketing_settings: [ACCOUNT] });
    const r = await syncInstagramComments({ graph: instagramGraph("TOKEN", f), db });
    expect(r).toEqual({ media: 1, comments: 1, error: null });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls[0].url).toContain("/111/comments?fields=");
    expect(db.writes.find((w) => w.table === "marketing_ig_comments")).toBeTruthy();
  });
  it("reply builds POST /{comment}/replies with the confirmed text and logs who sent it", async () => {
    expect(() => replyRequest("17900000000000001", "  ")).toThrow();
    const { f, calls } = mockFetch(() => ({ id: "17900000000000099" }));
    const db = fakeDb({ marketing_ig_comments: [{ id: "17900000000000001", media_id: "111", parent_id: null }] });
    const r = await replyToComment({ commentId: "17900000000000001", message: " Thank you! ", actorId: "u-1", aiSuggested: true }, { graph: instagramGraph("TOKEN", f), db });
    expect(r).toEqual({ ok: true, id: "17900000000000099" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/17900000000000001\/replies$/);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toBe("message=Thank+you%21");
    expect(db.writes.find((w) => w.table === "marketing_ig_comment_actions")!.row).toMatchObject({ action: "reply", actor_id: "u-1", ai_suggested: true, success: true });
  });
  it("a failed reply is logged and not retried", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Bad", code: 100 } }), { status: 400 })) as unknown as typeof fetch;
    const db = fakeDb({ marketing_ig_comments: [{ id: "17900000000000001", media_id: "111" }] });
    const r = await replyToComment({ commentId: "17900000000000001", message: "Hi", actorId: "u-1", aiSuggested: false }, { graph: instagramGraph("TOKEN", f), db });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    expect(db.writes.find((w) => w.table === "marketing_ig_comment_actions")!.row).toMatchObject({ success: false, meta_error_code: "100" });
  });
  it("hide/unhide builds POST /{comment} hide=true|false and logs it", async () => {
    expect(hideRequest("17900000000000001", false).fields).toEqual({ hide: "false" });
    const { f, calls } = mockFetch(() => ({ success: true }));
    const db = fakeDb({});
    await setCommentHidden({ commentId: "17900000000000001", hide: true, actorId: "u-2" }, { graph: instagramGraph("TOKEN", f), db });
    expect(calls[0].body).toBe("hide=true");
    expect(db.writes.find((w) => w.table === "marketing_ig_comment_actions")!.row).toMatchObject({ action: "hide", actor_id: "u-2", success: true });
  });
  it("AI suggestion asks for Portuguese when the comment is Portuguese and never calls Meta", async () => {
    const ask = vi.fn(async () => "Obrigado pelas palavras!");
    const db = fakeDb({ marketing_ig_comments: [{ id: "c1", username: "ana", body: "Que projeto lindo", media_caption: "Light study" }] });
    const out = await suggestCommentReply("c1", ask, db);
    expect(out).toBe("Obrigado pelas palavras!");
    const [system] = ask.mock.calls[0] as unknown as [string, string];
    expect(system).toContain("reply in Portuguese");
    expect(system).toContain("Calm, precise, warm.");
    expect(db.writes).toHaveLength(0);
  });
});
