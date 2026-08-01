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

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const BUCKET = "financial-documents";
const MAX_MESSAGES = 25;

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

export const Route = createFileRoute("/api/public/hooks/gmail-intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anonKey =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!anonKey || provided !== anonKey) {
          return new Response("Unauthorized", { status: 401 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const connKey = process.env.GOOGLE_MAIL_API_KEY;
        if (!lovableKey || !connKey) {
          return Response.json(
            { ok: false, error: "Gmail connector not linked (GOOGLE_MAIL_API_KEY missing)" },
            { status: 503 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ingestStoredDocument } = await import("@/lib/finance/doc-intake.server");

        const summary = { scanned: 0, queued: 0, ignored: 0, skipped: 0, errors: [] as string[] };

        try {
          const list = await gmail(
            `/users/me/messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(
              "has:attachment newer_than:14d",
            )}`,
            connKey,
            lovableKey,
          );
          const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
          if (ids.length === 0) return Response.json({ ok: true, ...summary });

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
              const parts = flatten(msg.payload as GmailPart).filter((p) => p.filename);

              let queued = 0;
              for (const part of parts) {
                const isPdf =
                  part.mimeType === "application/pdf" ||
                  (part.filename ?? "").toLowerCase().endsWith(".pdf");
                if (!isPdf || !part.body?.attachmentId) {
                  await supabaseAdmin.from("financial_email_ignored_items").insert({
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

                const att = await gmail(
                  `/users/me/messages/${id}/attachments/${part.body.attachmentId}`,
                  connKey,
                  lovableKey,
                );
                const b64 = String(att.data ?? "").replace(/-/g, "+").replace(/_/g, "/");
                const buf = Buffer.from(b64, "base64");
                const safe = (part.filename ?? "attachment.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
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
                });
                if (res.queueItemId) queued++;
                if (!res.ok) summary.errors.push(`${part.filename}: ${res.error}`);
              }

              if (queued === 0 && parts.length === 0) {
                await supabaseAdmin.from("financial_email_ignored_items").insert({
                  message_id: id,
                  from_address: from,
                  subject,
                  reason: "no_attachments",
                });
                summary.ignored++;
              }

              await supabaseAdmin.from("financial_email_processed_messages").insert({
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

          return Response.json({ ok: true, ...summary });
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
