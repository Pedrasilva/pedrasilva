/**
 * Inbox poller — reads every active mailbox in `email_sync_state`, classifies
 * new messages and writes them to `email_events`.
 *
 * Guarantees:
 *  - Nothing is ever SENT. The only Gmail writes are archive / trash, and only
 *    when an admin-created sender rule matches the sender.
 *  - A rule match is executed immediately and the row is inserted already
 *    resolved (`archived` / `trashed` / `labeled`) — it never queues.
 *  - Every AI-classified message (no rule match) lands as `status = 'pending'`
 *    for human review.
 *  - Idempotent: `email_events.gmail_message_id` is UNIQUE; conflicts are
 *    swallowed instead of pre-queried.
 *  - Per-inbox isolation: a failing mailbox is logged and the run continues.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import {
  matchRule,
  statusForAction,
  type RuleAction,
  type SenderRule,
} from "@/lib/inbox/rule-match";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";
const MAX_MESSAGES = 25;
/** First-run window when no history id is stored yet. */
const INITIAL_WINDOW = "newer_than:1d";

const CATEGORIES = [
  "new_enquiry",
  "project_correspondence",
  "supplier_invoice",
  "admin_finance",
  "recruitment",
  "newsletter_marketing",
] as const;

const ACTIONS = ["reply", "archive", "label_only", "escalate"] as const;

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

function flatten(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}

function header(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
) {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    null
  );
}

/** Plain-text body, truncated — never persisted, only sent to the classifier. */
function plainBody(payload: GmailPart | undefined): string {
  const part =
    flatten(payload).find((p) => p.mimeType === "text/plain" && p.body?.data) ??
    flatten(payload).find((p) => p.body?.data);
  const data = part?.body?.data;
  if (!data) return "";
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(b64, "base64").toString("utf8").slice(0, 4000);
  } catch {
    return "";
  }
}

async function gmail(path: string, connKey: string, lovableKey: string) {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gmail gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

const CLASSIFY_SCHEMA = {
  name: "email_triage",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: [...CATEGORIES] },
      confidence: { type: "number" },
      suggested_action: { type: "string", enum: [...ACTIONS] },
      draft_reply: { type: ["string", "null"] },
    },
    required: ["category", "confidence", "suggested_action", "draft_reply"],
  },
} as const;

type Classification = {
  category: string;
  confidence: number;
  suggested_action: string;
  draft_reply: string | null;
};

async function classify(
  input: { from: string | null; subject: string | null; body: string },
  lovableKey: string,
): Promise<Classification | null> {
  const system = [
    "You triage the inbox of Pedra Silva Architects (Lisbon, PT).",
    "Classify one email into exactly one category:",
    "- new_enquiry: a prospective client or new project request",
    "- project_correspondence: ongoing project/client/consultant exchanges",
    "- supplier_invoice: invoices, receipts, statements from suppliers",
    "- admin_finance: banking, tax, accounting, insurance, payroll admin",
    "- recruitment: job applications, internships, recruiter outreach",
    "- newsletter_marketing: newsletters, promotions, cold sales, spam",
    "suggested_action is one of reply | archive | label_only | escalate.",
    "draft_reply MUST be null unless suggested_action is 'reply'; when it is",
    "'reply', write a short professional draft in the language of the email.",
    "confidence is 0..1.",
  ].join("\n");

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `From: ${input.from ?? "(unknown)"}`,
            `Subject: ${input.subject ?? "(none)"}`,
            "Body:",
            input.body,
          ].join("\n"),
        },
      ],
      response_format: { type: "json_schema", json_schema: CLASSIFY_SCHEMA },
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${raw.slice(0, 200)}`);
  const content = (
    JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
  )?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content) as Classification;
  } catch {
    return null;
  }
}

/**
 * Rule auto-execution. A rule action is only ever archive | label_only |
 * trash — `reply` is not representable, so nothing can ever be sent here.
 */
async function gmailPost(
  path: string,
  connKey: string,
  lovableKey: string,
  body: unknown,
) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gmail gateway ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function executeRuleAction(
  action: RuleAction,
  messageId: string,
  connKey: string,
  lovableKey: string,
) {
  if (action === "label_only") return;
  if (action === "archive") {
    await gmailPost(`/users/me/messages/${messageId}/modify`, connKey, lovableKey, {
      removeLabelIds: ["INBOX"],
    });
    return;
  }
  await gmailPost(`/users/me/messages/${messageId}/trash`, connKey, lovableKey, {});
}

export const Route = createFileRoute("/api/public/hooks/inbox-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["GMAIL_INTAKE_SECRET"] ?? "";
        if (!expected) {
          return new Response("Intake hook secret not configured", {
            status: 503,
          });
        }
        const provided =
          request.headers.get("x-intake-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided || !safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const lovableKey = process.env["LOVABLE_API_KEY"];
        if (!lovableKey) {
          return Response.json(
            { ok: false, error: "LOVABLE_API_KEY missing" },
            { status: 503 },
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const { data: inboxes, error: inboxErr } = await supabaseAdmin
          .from("email_sync_state")
          .select("id, inbox_address, connector_secret_name, last_history_id")
          .eq("is_active", true);
        if (inboxErr) {
          return Response.json(
            { ok: false, error: inboxErr.message },
            { status: 500 },
          );
        }

        const { data: senderRules } = await supabaseAdmin
          .from("email_sender_rules")
          .select("match_type, sender_pattern, category, action")
          .eq("is_active", true);
        const rules = (senderRules ?? []) as SenderRule[];

        const summary = {
          inboxes: 0,
          scanned: 0,
          inserted: 0,
          duplicates: 0,
          errors: [] as string[],
          ruleMatched: 0,
          autoHandled: 0,
        };

        for (const inbox of inboxes ?? []) {
          summary.inboxes++;
          const connKey = inbox.connector_secret_name
            ? process.env[inbox.connector_secret_name]
            : undefined;

          if (!connKey) {
            summary.errors.push(
              `${inbox.inbox_address}: connector secret ${inbox.connector_secret_name} not available`,
            );
            await supabaseAdmin
              .from("email_sync_state")
              .update({ last_checked_at: new Date().toISOString() })
              .eq("id", inbox.id);
            continue;
          }

          let nextHistoryId: string | null = inbox.last_history_id ?? null;

          try {
            let ids: string[] = [];

            if (inbox.last_history_id) {
              // Incremental sync.
              try {
                const hist = await gmail(
                  `/users/me/history?startHistoryId=${encodeURIComponent(
                    inbox.last_history_id,
                  )}&historyTypes=messageAdded&maxResults=100`,
                  connKey,
                  lovableKey,
                );
                nextHistoryId = hist.historyId ?? inbox.last_history_id;
                const seen = new Set<string>();
                for (const h of hist.history ?? []) {
                  for (const added of h.messagesAdded ?? []) {
                    const id = added?.message?.id;
                    if (id && !seen.has(id)) {
                      seen.add(id);
                      ids.push(id);
                    }
                  }
                }
              } catch (histErr) {
                // 404 = history id too old; fall back to a bounded list.
                const list = await gmail(
                  `/users/me/messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(
                    INITIAL_WINDOW,
                  )}`,
                  connKey,
                  lovableKey,
                );
                ids = (list.messages ?? []).map((m: { id: string }) => m.id);
                summary.errors.push(
                  `${inbox.inbox_address}: history fallback (${
                    histErr instanceof Error ? histErr.message : String(histErr)
                  })`,
                );
              }
            } else {
              const list = await gmail(
                `/users/me/messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(
                  INITIAL_WINDOW,
                )}`,
                connKey,
                lovableKey,
              );
              ids = (list.messages ?? []).map((m: { id: string }) => m.id);
            }

            ids = ids.slice(0, MAX_MESSAGES);

            for (const id of ids) {
              try {
                const msg = await gmail(
                  `/users/me/messages/${id}?format=full`,
                  connKey,
                  lovableKey,
                );
                summary.scanned++;
                if (msg.historyId) {
                  nextHistoryId = String(
                    Math.max(Number(nextHistoryId ?? 0), Number(msg.historyId)),
                  );
                }

                const headers = msg.payload?.headers as Array<{
                  name: string;
                  value: string;
                }>;
                const from = header(headers, "From");
                const subject = header(headers, "Subject");
                const snippet: string = msg.snippet ?? "";
                const body = plainBody(msg.payload as GmailPart) || snippet;

                const rule = matchRule(rules, from);
                if (rule) summary.ruleMatched++;

                const result = rule
                  ? null
                  : await classify({ from, subject, body }, lovableKey);

                const category = CATEGORIES.includes(
                  result?.category as (typeof CATEGORIES)[number],
                )
                  ? result!.category
                  : null;
                const action = ACTIONS.includes(
                  result?.suggested_action as (typeof ACTIONS)[number],
                )
                  ? result!.suggested_action
                  : null;

                // Rule match: execute the Gmail action now and insert the row
                // already resolved — it never appears in the review queue.
                // AI-classified messages always land as `pending`.
                let finalStatus = "pending";
                if (rule) {
                  await executeRuleAction(rule.action, id, connKey, lovableKey);
                  finalStatus = statusForAction(rule.action);
                  summary.autoHandled++;
                }

                const { error: insErr } = await supabaseAdmin
                  .from("email_events")
                  .insert({
                    gmail_message_id: id,
                    thread_id: msg.threadId ?? id,
                    from_address: from,
                    subject,
                    snippet,
                    received_at: msg.internalDate
                      ? new Date(Number(msg.internalDate)).toISOString()
                      : null,
                    category: rule ? rule.category : category,
                    confidence: rule
                      ? 1.0
                      : typeof result?.confidence === "number"
                        ? result.confidence
                        : null,
                    suggested_action: rule ? rule.action : action,
                    draft_reply:
                      !rule && action === "reply"
                        ? (result?.draft_reply ?? null)
                        : null,
                    classification_source: rule ? "rule" : "ai",
                    status: finalStatus,
                    ...(rule ? { reviewed_at: new Date().toISOString() } : {}),
                  });

                if (insErr) {
                  if (insErr.code === "23505") summary.duplicates++;
                  else
                    summary.errors.push(`${inbox.inbox_address}/${id}: ${insErr.message}`);
                } else {
                  summary.inserted++;
                }
              } catch (msgErr) {
                summary.errors.push(
                  `${inbox.inbox_address}/${id}: ${
                    msgErr instanceof Error ? msgErr.message : String(msgErr)
                  }`,
                );
              }
            }

            if (!nextHistoryId) {
              try {
                const profile = await gmail(
                  "/users/me/profile",
                  connKey,
                  lovableKey,
                );
                nextHistoryId = profile.historyId
                  ? String(profile.historyId)
                  : null;
              } catch {
                /* keep null; next run re-uses the initial window */
              }
            }
          } catch (err) {
            // One bad mailbox must never abort the whole run.
            summary.errors.push(
              `${inbox.inbox_address}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }

          await supabaseAdmin
            .from("email_sync_state")
            .update({
              last_checked_at: new Date().toISOString(),
              last_history_id: nextHistoryId,
            })
            .eq("id", inbox.id);
        }

        return Response.json({ ok: true, ...summary });
      },
    },
  },
});
