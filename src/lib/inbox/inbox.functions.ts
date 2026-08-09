import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  archiveMessage,
  resolveInboxForMessage,
  sendReply,
  trashMessage,
  unarchiveMessage,
  untrashMessage,
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
  classification_source: string | null;
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
        "id, gmail_message_id, thread_id, from_address, subject, snippet, category, confidence, suggested_action, draft_reply, received_at, classification_source",
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

/** Move the message to Gmail's recoverable trash, then mark `trashed`. */
export const trashEmailEvent = createServerFn({ method: "POST" })
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
    await trashMessage(ctx, event.gmail_message_id);
    await markReviewed(data.id, context.userId, "trashed");
    return { ok: true };
  });

/**
 * Undo window action: put the row back in the queue and reverse the Gmail
 * side effect where one is reversible. A sent reply can never be un-sent.
 */
export const undoEmailEventAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanTriage(context.userId);
    const { data: event, error } = await supabaseAdmin
      .from("email_events")
      .select("id, gmail_message_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!event) throw new Error("Message not found");
    if (event.status === "pending") return { ok: true };
    if (event.status === "sent") {
      throw new Error("A sent reply cannot be undone");
    }

    if (event.status === "archived" || event.status === "trashed") {
      const ctx = await resolveInboxForMessage(
        await activeInboxes(),
        event.gmail_message_id,
      );
      if (event.status === "trashed") {
        await untrashMessage(ctx, event.gmail_message_id);
      }
      await unarchiveMessage(ctx, event.gmail_message_id);
    }

    const { error: updErr } = await supabaseAdmin
      .from("email_events")
      .update({ status: "pending", reviewed_by: null, reviewed_at: null })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Content view, attachment proxy and forwarding.
 * ------------------------------------------------------------------ */

export type EmailMessageContent = {
  html: string | null;
  text: string | null;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  docsIntakeAddress: string | null;
};

async function ctxForEvent(id: string) {
  const { data, error } = await supabaseAdmin
    .from("email_events")
    .select("id, gmail_message_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Message not found");
  const ctx = await resolveInboxForMessage(
    await activeInboxes(),
    data.gmail_message_id,
  );
  return { ctx, gmailMessageId: data.gmail_message_id };
}

/** Full body + attachment manifest. HTML is sanitised server-side. */
export const getEmailMessageContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<EmailMessageContent> => {
    await assertCanTriage(context.userId);
    const { ctx, gmailMessageId } = await ctxForEvent(data.id);
    const { getMessageContent } = await import("./gmail.server");
    const content = await getMessageContent(ctx, gmailMessageId);
    const sanitizeHtml = (await import("sanitize-html")).default;
    const { buildProxyUrl } = await import("./image-proxy.server");
    return {
      html: content.html
        ? sanitizeHtml(content.html, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat([
              "img",
              "style",
            ]),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              "*": ["style", "align", "width", "height", "colspan", "rowspan"],
              img: ["src", "alt", "width", "height", "style"],
              a: ["href", "name", "target", "rel"],
            },
            allowedSchemes: ["http", "https", "mailto", "cid", "data"],
            transformTags: {
              a: sanitizeHtml.simpleTransform("a", {
                target: "_blank",
                rel: "noopener noreferrer nofollow",
              }),
              // Remote images are tracking pixels until proven otherwise: route
              // every one through our proxy so the sender never sees the reader.
              img: (tagName, attribs) => {
                const src = attribs["src"] ?? "";
                if (/^(cid:|data:)/i.test(src)) return { tagName, attribs };
                const proxied = buildProxyUrl(src);
                if (!proxied) {
                  const { src: _dropped, ...rest } = attribs;
                  return { tagName, attribs: rest };
                }
                return {
                  tagName,
                  attribs: { ...attribs, src: proxied, loading: "lazy" },
                };
              },
            },
          })
            // style="background:url(...)" is the same leak by another door.
            .replace(/url\((?:&#x27;|['"])?\s*https?:[^)]*\)/gi, "none")
        : null,

      text: content.text,
      attachments: content.attachments,
      docsIntakeAddress: process.env["FINANCE_DOCS_INTAKE_ADDRESS"] ?? null,
    };
  });

/** Attachment bytes proxied through the gateway — the client never sees auth. */
export const downloadEmailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        attachmentId: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ base64: string }> => {
      await assertCanTriage(context.userId);
      const { ctx, gmailMessageId } = await ctxForEvent(data.id);
      const { getAttachment } = await import("./gmail.server");
      return getAttachment(ctx, gmailMessageId, data.attachmentId);
    },
  );

/** Forward the message with its attachments. Does not resolve the queue row. */
export const forwardEmailEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        to: z.string().trim().email().max(320),
        note: z.string().trim().max(5000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanTriage(context.userId);
    const { ctx, gmailMessageId } = await ctxForEvent(data.id);
    const { forwardMessage } = await import("./gmail.server");
    await forwardMessage(ctx, {
      gmailMessageId,
      to: data.to,
      ...(data.note ? { note: data.note } : {}),
    });
    return { ok: true };
  });
