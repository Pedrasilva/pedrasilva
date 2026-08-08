import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  archiveMessage,
  resolveInboxForMessage,
  sendReply,
} from "./gmail.server";

export type PendingEmailEvent = {
  id: string;
  gmail_message_id: string;
  thread_id: string;
  from_address: string | null;
  subject: string | null;
  snippet: string | null;
  category: string | null;
  confidence: number | null;
  suggested_action: string | null;
  draft_reply: string | null;
  received_at: string | null;
};

/** Admin, super-admin or explicit `inbox.triage` holders may act on the queue. */
async function assertCanTriage(userId: string) {
  const [superAdmin, admin, perm] = await Promise.all([
    supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabaseAdmin.rpc("has_permission", {
      _user_id: userId,
      _key: "inbox.triage",
    }),
  ]);
  if (superAdmin.data || admin.data || perm.data) return;
  throw new Error("You do not have permission to triage the inbox");
}

async function activeInboxes() {
  const { data, error } = await supabaseAdmin
    .from("email_sync_state")
    .select("inbox_address, connector_secret_name")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadEvent(id: string) {
  const { data, error } = await supabaseAdmin
    .from("email_events")
    .select("id, gmail_message_id, thread_id, status, draft_reply")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Message not found");
  if (data.status !== "pending") throw new Error("Message already reviewed");
  return data;
}

async function markReviewed(
  id: string,
  userId: string,
  status: string,
  draftReply?: string,
) {
  const { error } = await supabaseAdmin
    .from("email_events")
    .update({
      status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      ...(draftReply !== undefined ? { draft_reply: draftReply } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Pending queue, newest first. Read through the server so non-admin triagers
 *  with `inbox.triage` can see it without widening RLS on `email_events`. */
export const listPendingEmailEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingEmailEvent[]> => {
    await assertCanTriage(context.userId);
    const { data, error } = await supabaseAdmin
      .from("email_events")
      .select(
        "id, gmail_message_id, thread_id, from_address, subject, snippet, category, confidence, suggested_action, draft_reply, received_at",
      )
      .eq("status", "pending")
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as PendingEmailEvent[];
  });

/** Send the (possibly edited) reply on the original thread, then mark `sent`. */
export const approveAndSendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), body: z.string().trim().min(1).max(20000) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanTriage(context.userId);
    const event = await loadEvent(data.id);
    const ctx = await resolveInboxForMessage(
      await activeInboxes(),
      event.gmail_message_id,
    );
    // Gmail write first — the row stays pending if this throws.
    await sendReply(ctx, {
      gmailMessageId: event.gmail_message_id,
      threadId: event.thread_id,
      body: data.body,
    });
    await markReviewed(data.id, context.userId, "sent", data.body);
    return { ok: true };
  });

/** Remove the INBOX label in Gmail, then mark `archived`. */
export const archiveEmailEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanTriage(context.userId);
    const event = await loadEvent(data.id);
    const ctx = await resolveInboxForMessage(
      await activeInboxes(),
      event.gmail_message_id,
    );
    await archiveMessage(ctx, event.gmail_message_id);
    await markReviewed(data.id, context.userId, "archived");
    return { ok: true };
  });

/** No Gmail write: acknowledge (`labeled`) or escalate (`rejected`). */
export const resolveEmailEventWithoutGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["labeled", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanTriage(context.userId);
    await loadEvent(data.id);
    await markReviewed(data.id, context.userId, data.status);
    return { ok: true };
  });
