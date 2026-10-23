/** Instagram comments: pure normalisation and request builders (client- and server-safe, no token). */
export const COMMENT_FIELDS = "id,text,username,timestamp,hidden,from{id,username},replies{id,text,username,timestamp,hidden,from{id,username}}";
export const MAX_REPLY = 2200;

export type MediaLite = { id: string; caption?: string | null; thumbnail_url?: string | null; media_url?: string | null; permalink?: string | null; media_type?: string };
type RawComment = { id: string; text?: string; username?: string; timestamp?: string; hidden?: boolean; from?: { id?: string; username?: string }; replies?: { data?: RawComment[] } };
export type CommentRow = {
  id: string; media_id: string; parent_id: string | null; username: string | null; body: string; commented_at: string | null;
  hidden: boolean; from_us: boolean; media_thumbnail: string | null; media_permalink: string | null; media_caption: string | null;
};

/** Flattens one media's /comments response (top-level + nested replies) into rows. */
export function normalizeComments(media: MediaLite, data: RawComment[], account: { id?: string | null; username: string }): CommentRow[] {
  const thumb = media.media_type === "VIDEO" ? media.thumbnail_url ?? null : media.media_url ?? media.thumbnail_url ?? null;
  const row = (c: RawComment, parent: string | null): CommentRow => ({
    id: c.id, media_id: media.id, parent_id: parent, username: c.username ?? c.from?.username ?? null, body: c.text ?? "",
    commented_at: c.timestamp ?? null, hidden: !!c.hidden,
    from_us: (!!account.id && c.from?.id === account.id) || (c.username ?? c.from?.username) === account.username,
    media_thumbnail: thumb, media_permalink: media.permalink ?? null, media_caption: (media.caption ?? "").slice(0, 300) || null,
  });
  return data.flatMap((c) => [row(c, null), ...(c.replies?.data ?? []).map((r) => row(r, c.id))]);
}

/** Validates the text a person confirmed; never sends empty or over-long replies. */
export function replyRequest(commentId: string, message: string): { path: string; fields: Record<string, string> } {
  const m = message.trim();
  if (!m) throw new Error("Reply is empty");
  if (m.length > MAX_REPLY) throw new Error("Reply is too long");
  if (!/^\d+$/.test(commentId)) throw new Error("Invalid comment");
  return { path: `${commentId}/replies`, fields: { message: m } };
}

export function hideRequest(commentId: string, hide: boolean): { path: string; fields: Record<string, string> } {
  if (!/^\d+$/.test(commentId)) throw new Error("Invalid comment");
  return { path: commentId, fields: { hide: hide ? "true" : "false" } };
}

/** Unread = not ours and not yet opened. */
export const isUnread = (c: { from_us: boolean; read_at: string | null }) => !c.from_us && !c.read_at;
