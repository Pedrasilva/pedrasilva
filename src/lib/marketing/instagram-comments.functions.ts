import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireMarketing(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_module_permission", { _user_id: context.userId, _key: "marketing.view", _required_scope: "all" });
  if (error || !data) throw new Error("Not allowed");
}
const commentId = z.string().regex(/^\d{1,40}$/);

export const syncCommentsNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireMarketing(context);
  const { syncInstagramComments } = await import("./instagram-comments.server");
  return syncInstagramComments();
});

export const suggestReply = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ commentId }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMarketing(context);
    const { suggestCommentReply } = await import("./instagram-comments.server");
    const { claudeText } = await import("./nudges.server");
    try { return { text: await suggestCommentReply(data.commentId, (s, u) => claudeText(s, [{ type: "text", text: u }], 300)), error: null }; }
    catch (e) { return { text: "", error: e instanceof Error ? e.message : "AI unavailable" }; }
  });

export const sendCommentReply = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ commentId, message: z.string().min(1).max(2200), aiSuggested: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMarketing(context);
    const { replyToComment } = await import("./instagram-comments.server");
    return replyToComment({ ...data, actorId: context.userId });
  });

export const setCommentVisibility = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ commentId, hide: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMarketing(context);
    const { setCommentHidden } = await import("./instagram-comments.server");
    return setCommentHidden({ ...data, actorId: context.userId });
  });

/**
 * Names for the comment action log. Uses the existing HR link (auth email = collaborators.email);
 * only returns name and photo path for actors who appear in the Marketing action log.
 */
export const commentActorNames = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMarketing(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acts } = await supabaseAdmin.from("marketing_ig_comment_actions" as never).select("actor_id").limit(2000);
    const ids = [...new Set(((acts ?? []) as Array<{ actor_id: string }>).map((a) => a.actor_id).filter(Boolean))];
    const out: Record<string, { name: string | null; fotoPath: string | null }> = {};
    const emails = new Map<string, string>();
    await Promise.all(ids.map(async (id) => { const { data } = await supabaseAdmin.auth.admin.getUserById(id); if (data?.user?.email) emails.set(id, data.user.email.toLowerCase()); }));
    if (emails.size) {
      const { data: cols } = await supabaseAdmin.from("collaborators").select("nome,email,foto_path").in("email", [...new Set(emails.values())]);
      const byEmail = new Map((cols ?? []).map((c) => [String(c.email).toLowerCase(), c]));
      for (const [id, e] of emails) { const c = byEmail.get(e); out[id] = { name: c?.nome ?? null, fotoPath: c?.foto_path ?? null }; }
    }
    return out;
  });
