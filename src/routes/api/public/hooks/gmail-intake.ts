/**
 * D4 — Gmail intake poller.
 *
 * Polled by pg_cron (every 5 minutes). Reads the dedicated finance inbox via
 * the Lovable connector gateway (Gmail API, read-only), stores every PDF
 * attachment in the `financial-documents` bucket, and pushes each one through
 * the SAME D3 pipeline (`ingestStoredDocument`) with `source = 'email_ingestion'`.
 *
 * Guarantees:
 *  - No auto-approval: everything lands in `financial_document_review_queue`
 *    as `pending_review`, exactly like a manual upload.
 *  - Nothing is silently dropped: non-PDF attachments and mails without
 *    usable attachments are logged to `financial_email_ignored_items`.
 *  - Idempotent: processed message ids are recorded in
 *    `financial_email_processed_messages`.
 *  - Email BODIES are never parsed for financial data (out of scope).
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const BUCKET = "financial-documents";
// Each attachment is buffered in memory before upload, so a large batch blows
// the worker memory limit and 502s the whole run (nothing gets recorded and the
// same mails are retried forever). Keep batches small — the job runs every 5min.
const MAX_MESSAGES = 4;
/** Attachments above this size are skipped rather than buffered (worker OOM). */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailPart[];
  headers?: Array<{ name: string; value: string }>;
};

function flatten(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}

function header(headers: Array<{ name: string; value: string }> | undefined, name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

async function gmail(path: string, apiKey: string, lovableKey: string) {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail gateway ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** The linked Gmail connection whose mailbox IS the finance address (cached per worker). */
let mailboxCache: { address: string; key: string } | null = null;
async function findMailboxKey(address: string, lovableKey: string): Promise<string | null> {
  const want = address.trim().toLowerCase();
  if (mailboxCache?.address === want) return mailboxCache.key;
  const keys = Object.keys(process.env)
    .filter((k) => /^GOOGLE_MAIL_API_KEY(_\d+)?$/.test(k))
    .map((k) => process.env[k]!)
    .filter(Boolean);
  for (const key of new Set(keys)) {
    try {
      const p = await gmail("/users/me/profile", key, lovableKey);
      if (String(p.emailAddress ?? "").toLowerCase() === want) {
        mailboxCache = { address: want, key };
        return key;
      }
    } catch { /* not this one */ }
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/gmail-intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared-secret gate: only the scheduled pg_cron job knows this value.
        // The Supabase anon key is NOT a secret (it ships in the client bundle),
        // so it is deliberately not accepted here.
        const expected = process.env.GMAIL_INTAKE_SECRET ?? "";
        if (!expected) {
          return new Response("Intake hook secret not configured", { status: 503 });
        }
        const provided =
          request.headers.get("x-intake-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided || !safeEqual(provided, expected)) {
          // Nothing is processed or logged for unauthenticated calls.
          return new Response("Unauthorized", { status: 401 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) {
          return Response.json({ ok: false, error: "LOVABLE_API_KEY missing" }, { status: 503 });
        }
        // Items removed more than 30 days ago are permanently deleted (logged).
        try {
          const { purgeExpiredRemoved } = await import("@/lib/finance/recipient-rule.server");
          await purgeExpiredRemoved();
          const { processDueDriveCopies } = await import("@/lib/finance/bank-drive-filing.server");
          await processDueDriveCopies();
        } catch (e) {
          console.error("[gmail-intake] purge failed", e);
        }
        // Optional catch-up window (shared-secret callers only): read older mail.
        let body: { since?: string; pageToken?: string } = {};
        try { body = (await request.json()) as typeof body; } catch { body = {}; }
        const since = typeof body.since === "string" && /^\d{4}\/\d{2}\/\d{2}$/.test(body.since) ? body.since : null;
        const pageToken = typeof body.pageToken === "string" ? body.pageToken : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ingestStoredDocument } = await import("@/lib/finance/doc-intake.server");
        const { ingestMt940File, looksLikeMt940, decodeMt940 } = await import(
          "@/lib/finance/mt940-intake.server"
        );

        const summary = {
          scanned: 0,
          queued: 0,
          ignored: 0,
          skipped: 0,
          mt940Imported: 0,
          mt940Duplicates: 0,
          duplicates: 0,
          errors: [] as string[],
        };


        // Documents that hit an AI limit are read again once their retry time
        // has passed (a few per run), so they never stay "unknown".
        try {
          const { reprocessQueueItem } = await import("@/lib/finance/doc-intake.server");
          const { data: due } = await supabaseAdmin
            .from("financial_document_review_queue")
            .select("id")
            .eq("status", "pending_review")
            .lte("retry_after", new Date().toISOString())
            .order("retry_after", { ascending: true })
            .limit(2);
          for (const r of due ?? []) await reprocessQueueItem(r.id);
        } catch (err) {
          summary.errors.push(`retry: ${err instanceof Error ? err.message : String(err)}`);
        }

        try {
          const { financeGmailQuery, matchSenderRule, senderEmail } = await import("@/lib/finance/sender-rules");
          const { data: settings } = await supabaseAdmin
            .from("finance_intake_settings").select("finance_address").eq("entity_id", PSA_ENTITY_ID).maybeSingle();
          const financeAddress = settings?.finance_address?.trim();
          if (!financeAddress) {
            return Response.json({ ok: false, error: "Finance address not configured", ...summary }, { status: 503 });
          }
          // Only the finance mailbox itself is read: pick the linked Google
          // connection signed in as the finance address. Never another inbox.
          const connKey = await findMailboxKey(financeAddress, lovableKey);
          if (!connKey) {
            return Response.json(
              { ok: false, error: `No Google connection signed in as ${financeAddress}`, ...summary },
              { status: 503 },
            );
          }
          const { data: ruleRows } = await supabaseAdmin.from("finance_sender_rules").select("pattern, action").eq("entity_id", PSA_ENTITY_ID);
          const rules = (ruleRows ?? []) as Array<{ pattern: string; action: "ignore" | "process" }>;
          const list = await gmail(
            `/users/me/messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(
              financeGmailQuery(since),
            )}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
            connKey,
            lovableKey,
          );
          const nextPageToken: string | null = list.nextPageToken ?? null;
          const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
          if (ids.length === 0) return Response.json({ ok: true, nextPageToken, ...summary });

          const { data: seen } = await supabaseAdmin
            .from("financial_email_processed_messages")
            .select("message_id")
            .in("message_id", ids);
          const seenSet = new Set((seen ?? []).map((r) => r.message_id));

          for (const id of ids) {
            if (seenSet.has(id)) {
              summary.skipped++;
              continue;
            }
            summary.scanned++;
            try {
              const msg = await gmail(`/users/me/messages/${id}?format=full`, connKey, lovableKey);
              const headers = msg.payload?.headers as Array<{ name: string; value: string }>;
              const from = header(headers, "From");
              const subject = header(headers, "Subject");
              const senderRule = matchSenderRule(from, rules);
              // "Sempre ignorar" wins over everything: nothing is downloaded or read.
              const parts = senderRule === "ignore"
                ? []
                : flatten(msg.payload as GmailPart).filter((p) => p.filename);
              if (senderRule === "ignore") {
                await supabaseAdmin.from("financial_email_ignored_items").insert({ entity_id: PSA_ENTITY_ID,
                  message_id: id, from_address: from, subject, reason: "sender_rule_ignore",
                });
                summary.ignored++;
              }

              let queued = 0;
              for (const part of parts) {
                if (!part.body?.attachmentId) {
                  await supabaseAdmin.from("financial_email_ignored_items").insert({ entity_id: PSA_ENTITY_ID,
                    message_id: id,
                    from_address: from,
                    subject,
                    attachment_filename: part.filename ?? null,
                    reason: "not_a_pdf_attachment",
                    payload: { mimeType: part.mimeType ?? null },
                  });
                  summary.ignored++;
                  continue;
                }

                if ((part.body.size ?? 0) > MAX_ATTACHMENT_BYTES) {
                  await supabaseAdmin.from("financial_email_ignored_items").insert({ entity_id: PSA_ENTITY_ID,
                    message_id: id,
                    from_address: from,
                    subject,
                    attachment_filename: part.filename ?? null,
                    reason: "attachment_too_large",
                    payload: { mimeType: part.mimeType ?? null, size: part.body.size ?? null },
                  });
                  summary.ignored++;
                  continue;
                }

                const att = await gmail(
                  `/users/me/messages/${id}/attachments/${part.body.attachmentId}`,
                  connKey,
                  lovableKey,
                );
                const b64 = String(att.data ?? "").replace(/-/g, "+").replace(/_/g, "/");
                const buf = Buffer.from(b64, "base64");
                const safe = (part.filename ?? "attachment.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
                const isPdf =
                  part.mimeType === "application/pdf" ||
                  (part.filename ?? "").toLowerCase().endsWith(".pdf");

                // MT940 bank statements are detected by CONTENT (banks vary on
                // extension/mime: .sta, .940, .txt, application/octet-stream…).
                if (!isPdf && looksLikeMt940(decodeMt940(new Uint8Array(buf)))) {
                  const res = await ingestMt940File({
                    bytes: new Uint8Array(buf),
                    fileName: part.filename ?? `mt940-${id}.sta`,
                    storagePathHint: `intake/email/mt940/${id}-${safe}`,
                  });
                  if (res.ok) {
                    summary.mt940Imported += res.rowsImported;
                    summary.mt940Duplicates += res.rowsDuplicate;
                    queued++;
                  } else {
                    // Never silently dropped: the raw file is retained and the case is visible.
                    await supabaseAdmin.from("financial_email_ignored_items").insert({ entity_id: PSA_ENTITY_ID,
                      message_id: id,
                      from_address: from,
                      subject,
                      attachment_filename: part.filename ?? null,
                      reason: `mt940_${res.status}`,
                      payload: {
                        mimeType: part.mimeType ?? null,
                        iban: "iban" in res ? res.iban ?? null : null,
                        storage_path: "storagePath" in res ? res.storagePath ?? null : null,
                        detail: res.reason,
                      },
                    });
                    summary.ignored++;
                  }
                  continue;
                }

                if (!isPdf) {
                  await supabaseAdmin.from("financial_email_ignored_items").insert({ entity_id: PSA_ENTITY_ID,
                    message_id: id,
                    from_address: from,
                    subject,
                    attachment_filename: part.filename ?? null,
                    reason: "not_a_pdf_attachment",
                    payload: { mimeType: part.mimeType ?? null },
                  });
                  summary.ignored++;
                  continue;
                }

                const path = `intake/email/${id}-${safe}`;
                const { error: upErr } = await supabaseAdmin.storage
                  .from(BUCKET)
                  .upload(path, buf, { contentType: "application/pdf", upsert: true });
                if (upErr) throw new Error(`upload: ${upErr.message}`);

                const res = await ingestStoredDocument({
                  bucket: BUCKET,
                  storagePath: path,
                  originalFilename: part.filename ?? null,
                  source: "email_ingestion",
                  forceProcess: senderRule === "process",
                  senderAddress: senderEmail(from),
                });
                if (res.queueItemId) queued++;
                if (res.duplicate) summary.duplicates++;
                if (!res.ok) summary.errors.push(`${part.filename}: ${res.error}`);
              }


              if (queued === 0 && parts.length === 0 && senderRule !== "ignore") {
                await supabaseAdmin.from("financial_email_ignored_items").insert({ entity_id: PSA_ENTITY_ID,
                  message_id: id,
                  from_address: from,
                  subject,
                  reason: "no_attachments",
                });
                summary.ignored++;
              }

              await supabaseAdmin.from("financial_email_processed_messages").insert({ entity_id: PSA_ENTITY_ID,
                message_id: id,
                thread_id: msg.threadId ?? null,
                from_address: from,
                subject,
                received_at: msg.internalDate
                  ? new Date(Number(msg.internalDate)).toISOString()
                  : null,
                attachments_queued: queued,
              });
              summary.queued += queued;
            } catch (err) {
              summary.errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          return Response.json({ ok: true, nextPageToken, ...summary });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err), ...summary },
            { status: 500 },
          );
        }
      },
    },
  },
});
