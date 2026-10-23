import { instagramGraph, InstagramError } from "./instagram-graph.server";
import { COMMENT_FIELDS, hideRequest, normalizeComments, replyRequest, type MediaLite } from "./instagram-comments";
import { META_EXPECTED_USERNAME } from "./meta-connection";

type Graph = ReturnType<typeof instagramGraph>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function admin(): Promise<Db> { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
function token() { const t = process.env["META_SYSTEM_USER_TOKEN"]; if (!t) throw new InstagramError("Instagram connection unavailable", "connection"); return t; }

/** Reads comments on the latest published posts (read-only Graph calls) and upserts them. */
export async function syncInstagramComments(opts: { graph?: Graph; db?: Db } = {}) {
  const db = opts.db ?? await admin();
  const { data: s } = await db.from("marketing_settings").select("instagram_account_id,instagram_feed").eq("id", true).single();
  if (!s?.instagram_account_id) return { media: 0, comments: 0, error: "connectionUnavailable" };
  const graph = opts.graph ?? instagramGraph(token());
  let media = (Array.isArray(s.instagram_feed) ? s.instagram_feed : []) as MediaLite[];
  if (!media.length) {
    const r = await graph(`${s.instagram_account_id}/media?fields=id,media_type,media_url,thumbnail_url,permalink,caption&limit=30`);
    media = Array.isArray(r.data) ? r.data : [];
  }
  let comments = 0, failed = 0;
  for (const m of media.slice(0, 30)) {
    try {
      const r = await graph(`${m.id}/comments?fields=${encodeURIComponent(COMMENT_FIELDS)}&limit=50`);
      const rows = normalizeComments(m, Array.isArray(r.data) ? r.data : [], { id: s.instagram_account_id, username: META_EXPECTED_USERNAME });
      if (rows.length) {
        const now = new Date().toISOString();
        // first_seen_at/read_at are preserved on conflict because they are not in the payload.
        const { error } = await db.from("marketing_ig_comments").upsert(rows.map((x) => ({ ...x, synced_at: now })), { onConflict: "id" });
        if (error) throw error;
        comments += rows.length;
      }
    } catch { failed++; }
  }
  await db.from("marketing_settings").update({ instagram_comments_synced_at: new Date().toISOString(), instagram_comments_error: failed ? "commentsPartial" : null }).eq("id", true);
  return { media: media.length, comments, error: failed ? "commentsPartial" : null };
}

export async function syncInstagramCommentsIfStale() {
  const db = await admin();
  const { data: s } = await db.from("marketing_settings").select("instagram_comments_synced_at").eq("id", true).single();
  if (s?.instagram_comments_synced_at && Date.now() - Date.parse(s.instagram_comments_synced_at) < 14 * 60_000) return { skipped: true };
  return syncInstagramComments({ db });
}

async function logAction(db: Db, row: Record<string, unknown>) {
  await db.from("marketing_ig_comment_actions").insert(row);
}

/** Sends a reply a person typed/confirmed. Called only from the authenticated Send action. */
export async function replyToComment(input: { commentId: string; message: string; actorId: string; aiSuggested: boolean }, opts: { graph?: Graph; db?: Db } = {}) {
  const db = opts.db ?? await admin();
  const req = replyRequest(input.commentId, input.message);
  const { data: c } = await db.from("marketing_ig_comments").select("id,media_id,parent_id,media_thumbnail,media_permalink,media_caption").eq("id", input.commentId).maybeSingle();
  if (!c) throw new Error("Comment not found");
  const graph = opts.graph ?? instagramGraph(token());
  try {
    const r = await graph(req.path, req.fields);
    await logAction(db, { comment_id: input.commentId, action: "reply", actor_id: input.actorId, body: req.fields.message, ai_suggested: input.aiSuggested, meta_result_id: r.id ?? null, success: true });
    if (r.id) await db.from("marketing_ig_comments").upsert({ id: String(r.id), media_id: c.media_id, parent_id: c.parent_id ?? c.id, username: META_EXPECTED_USERNAME, body: req.fields.message, commented_at: new Date().toISOString(), from_us: true, media_thumbnail: c.media_thumbnail, media_permalink: c.media_permalink, media_caption: c.media_caption, read_at: new Date().toISOString() }, { onConflict: "id" });
    return { ok: true as const, id: r.id ?? null };
  } catch (e) {
    const err = e instanceof InstagramError ? e : new InstagramError("Instagram reply failed", "unknown");
    await logAction(db, { comment_id: input.commentId, action: "reply", actor_id: input.actorId, body: req.fields.message, ai_suggested: input.aiSuggested, success: false, meta_error_code: err.code, meta_error_message: err.message });
    // Never retried automatically: an uncertain network outcome could post twice.
    return { ok: false as const, error: err.message };
  }
}

export async function setCommentHidden(input: { commentId: string; hide: boolean; actorId: string }, opts: { graph?: Graph; db?: Db } = {}) {
  const db = opts.db ?? await admin();
  const req = hideRequest(input.commentId, input.hide);
  const graph = opts.graph ?? instagramGraph(token());
  const action = input.hide ? "hide" : "unhide";
  try {
    await graph(req.path, req.fields);
    await db.from("marketing_ig_comments").update({ hidden: input.hide }).eq("id", input.commentId);
    await logAction(db, { comment_id: input.commentId, action, actor_id: input.actorId, success: true });
    return { ok: true as const };
  } catch (e) {
    const err = e instanceof InstagramError ? e : new InstagramError("Instagram update failed", "unknown");
    await logAction(db, { comment_id: input.commentId, action, actor_id: input.actorId, success: false, meta_error_code: err.code, meta_error_message: err.message });
    return { ok: false as const, error: err.message };
  }
}

/** Claude draft only — returned to the person to edit; never sent from here. */
export async function suggestCommentReply(commentId: string, ask: (system: string, user: string) => Promise<string>, db?: Db) {
  const sb = db ?? await admin();
  const { data: c } = await sb.from("marketing_ig_comments").select("username,body,media_caption").eq("id", commentId).maybeSingle();
  if (!c) throw new Error("Comment not found");
  const { getActiveMarketingBible } = await import("./bible.server");
  const bible = await getActiveMarketingBible();
  const system = `You draft short Instagram comment replies for Pedra Silva Arquitectos (@${META_EXPECTED_USERNAME}). Follow this Marketing Bible tone:\n${(bible?.content_md ?? "").slice(0, 6000)}\n\nRules: reply in Portuguese (European) if the comment is written in Portuguese, otherwise in English. 1–2 sentences, warm and precise, no hashtags, no emojis unless the comment uses them, never mention clients, cities, sectors or project details not already in the post caption, never promise anything. Output only the reply text.`;
  const user = `Post caption: ${c.media_caption ?? "(none)"}\nComment by @${c.username ?? "user"}: ${c.body}`;
  return (await ask(system, user)).trim().slice(0, 600);
}
