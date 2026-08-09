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
              img: ["src", "alt", "width", "height", "style", "loading"],
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

/* ------------------------------------------------------------------ *
 * Natural-language sender rules: parse → preview → save + bulk apply.
 * ------------------------------------------------------------------ */

const RULE_CATEGORIES = [
  "new_enquiry",
  "project_correspondence",
  "supplier_invoice",
  "admin_finance",
  "recruitment",
  "newsletter_marketing",
] as const;

/** Rule management is admin-only, matching the RLS on `email_sender_rules`. */
async function assertCanManageRules(userId: string) {
  const [superAdmin, admin] = await Promise.all([
    supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (superAdmin.data || admin.data) return;
  throw new Error("Only administrators can manage sender rules");
}

const parsedRuleSchema = z.object({
  match_type: z.enum(RULE_MATCH_TYPES),
  sender_pattern: z.string().trim().min(3).max(320),
  category: z.enum(RULE_CATEGORIES),
  // `reply` can never be a rule action — the enum makes it unrepresentable.
  action: z.enum(RULE_ACTIONS),
});

export type ParsedSenderRule = z.infer<typeof parsedRuleSchema>;

export type RulePreview = {
  rules: Array<ParsedSenderRule & { pendingMatches: number }>;
  totalPendingMatches: number;
  notes: string | null;
};

const RULE_SCHEMA = {
  name: "sender_rules",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      rules: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            match_type: { type: "string", enum: [...RULE_MATCH_TYPES] },
            sender_pattern: { type: "string" },
            category: { type: "string", enum: [...RULE_CATEGORIES] },
            action: { type: "string", enum: [...RULE_ACTIONS] },
          },
          required: ["match_type", "sender_pattern", "category", "action"],
        },
      },
      notes: { type: ["string", "null"] },
    },
    required: ["rules", "notes"],
  },
} as const;

async function pendingMatchCounts(
  rules: ParsedSenderRule[],
): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("email_events")
    .select("id, from_address")
    .eq("status", "pending")
    .limit(2000);
  if (error) throw new Error(error.message);
  return rules.map(
    (rule) =>
      (data ?? []).filter((row) => !!matchRule([rule], row.from_address)).length,
  );
}

/** Turn "delete everything from facebook" into structured, previewable rules. */
export const parseSenderRuleInstruction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ instruction: z.string().trim().min(3).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RulePreview> => {
    await assertCanManageRules(context.userId);
    const lovableKey = process.env["LOVABLE_API_KEY"];
    if (!lovableKey) throw new Error("AI is not configured");

    const system = [
      "You convert a plain-language inbox instruction into sender rules for",
      "Pedra Silva Architects' email triage system.",
      "Each rule: match_type (exact_address | domain), sender_pattern,",
      "category, action.",
      "sender_pattern is a bare email address (exact_address) or a bare domain",
      "without '@' (domain), always lowercase.",
      "action is ONLY archive | label_only | trash. Sending a reply is never",
      "allowed as a rule action — if the instruction asks for a reply, return",
      "an empty rules array and explain why in notes.",
      "'delete', 'remove', 'get rid of' mean trash. 'archive', 'file away',",
      "'out of my inbox' mean archive. 'just tag/label it' means label_only.",
      "Return several rules when a brand plausibly sends from more than one",
      "domain (e.g. facebook -> facebook.com and facebookmail.com).",
      "Pick the most plausible category; default to newsletter_marketing for",
      "social networks, promotions and cold outreach.",
      "notes: one short sentence for the operator, or null.",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.instruction },
        ],
        response_format: { type: "json_schema", json_schema: RULE_SCHEMA },
      }),
    });
    const raw = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached — try again shortly");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in workspace settings");
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${raw.slice(0, 200)}`);

    const content = (
      JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
    )?.choices?.[0]?.message?.content;
    if (!content) throw new Error("The assistant returned nothing to preview");

    let parsedPayload: { rules?: unknown[]; notes?: string | null };
    try {
      parsedPayload = JSON.parse(content);
    } catch {
      throw new Error("The assistant returned an unreadable rule");
    }

    // Reject anything off-shape rather than trusting the model.
    const rules: ParsedSenderRule[] = [];
    for (const candidate of parsedPayload.rules ?? []) {
      const result = parsedRuleSchema.safeParse(candidate);
      if (!result.success) continue;
      const rule = {
        ...result.data,
        sender_pattern: normalizePattern(result.data.sender_pattern),
      };
      if (rule.match_type === "exact_address" && !rule.sender_pattern.includes("@")) {
        continue;
      }
      if (rule.match_type === "domain" && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(rule.sender_pattern)) {
        continue;
      }
      if (rules.some((r) => r.match_type === rule.match_type && r.sender_pattern === rule.sender_pattern)) {
        continue;
      }
      rules.push(rule);
    }

    const counts = await pendingMatchCounts(rules);
    return {
      rules: rules.map((r, i) => ({ ...r, pendingMatches: counts[i] ?? 0 })),
      totalPendingMatches: counts.reduce((a, b) => a + b, 0),
      notes: parsedPayload.notes ?? null,
    };
  });

export type RuleSaveResult = {
  created: number;
  skipped: number;
  applied: number;
  failed: number;
  errors: string[];
};

/** Save confirmed rules, then execute them against the pending backlog. */
export const createSenderRulesWithBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ rules: z.array(parsedRuleSchema).min(1).max(10) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RuleSaveResult> => {
    await assertCanManageRules(context.userId);

    const result: RuleSaveResult = {
      created: 0,
      skipped: 0,
      applied: 0,
      failed: 0,
      errors: [],
    };

    const { data: existing } = await supabaseAdmin
      .from("email_sender_rules")
      .select("match_type, sender_pattern");

    const saved: ParsedSenderRule[] = [];
    for (const rule of data.rules) {
      const pattern = normalizePattern(rule.sender_pattern);
      const dupe = (existing ?? []).some(
        (e) =>
          e.match_type === rule.match_type &&
          normalizePattern(e.sender_pattern) === pattern,
      );
      if (dupe) {
        result.skipped++;
        saved.push({ ...rule, sender_pattern: pattern });
        continue;
      }
      const { error } = await supabaseAdmin.from("email_sender_rules").insert({
        match_type: rule.match_type,
        sender_pattern: pattern,
        category: rule.category,
        action: rule.action,
      });
      if (error) {
        result.errors.push(`${pattern}: ${error.message}`);
        continue;
      }
      result.created++;
      saved.push({ ...rule, sender_pattern: pattern });
    }

    if (saved.length === 0) return result;

    // Retroactive apply over the pending backlog.
    const { data: pending, error: pendErr } = await supabaseAdmin
      .from("email_events")
      .select("id, gmail_message_id, from_address")
      .eq("status", "pending")
      .limit(2000);
    if (pendErr) {
      result.errors.push(pendErr.message);
      return result;
    }

    const inboxes = await activeInboxes();
    for (const row of pending ?? []) {
      const rule = matchRule(saved, row.from_address);
      if (!rule) continue;
      try {
        if (rule.action !== "label_only") {
          const ctx = await resolveInboxForMessage(inboxes, row.gmail_message_id);
          if (rule.action === "archive") {
            await archiveMessage(ctx, row.gmail_message_id);
          } else {
            await trashMessage(ctx, row.gmail_message_id);
          }
        }
        const { error: updErr } = await supabaseAdmin
          .from("email_events")
          .update({
            status: statusForAction(rule.action),
            category: rule.category,
            suggested_action: rule.action,
            classification_source: "rule",
            draft_reply: null,
            reviewed_by: context.userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updErr) throw new Error(updErr.message);
        result.applied++;
      } catch (err) {
        result.failed++;
        if (result.errors.length < 10) {
          result.errors.push(
            `${row.from_address ?? row.gmail_message_id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    return result;
  });

export type AutoHandledEmailEvent = PendingEmailEvent & {
  status: string;
  reviewed_at: string | null;
};

/** Audit tab: everything a rule handled without human review. */
export const listAutoHandledEmailEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutoHandledEmailEvent[]> => {
    await assertCanTriage(context.userId);
    const { data, error } = await supabaseAdmin
      .from("email_events")
      .select(
        "id, gmail_message_id, thread_id, from_address, subject, snippet, category, confidence, suggested_action, draft_reply, received_at, classification_source, status, reviewed_at",
      )
      .eq("classification_source", "rule")
      .neq("status", "pending")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as AutoHandledEmailEvent[];
  });
