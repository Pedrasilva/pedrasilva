/**
 * Marketing Pass 2 — ideas@pedrasilva.com intake poller.
 *
 * Polled by pg_cron (`marketing-intake-every-5-min`). Reads the dedicated
 * ideas@ mailbox (read-only) through the Lovable Gmail connector gateway and
 * turns each colleague email into a `channel = 'email'` marketing capture.
 * The gate secret lives only in Vault and is checked via
 * `marketing_intake_secret_matches` (service_role only).
 *
 * The service role bypasses RLS and storage policies, so the extension
 * allow-list is enforced here. ideas@ is NOT registered in email_sync_state.
 */
import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const BUCKET = "marketing-assets";
const MAX_MESSAGES = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const INLINE_IMAGE_MAX_BYTES = 30 * 1024;
const MAX_TEXT = 20_000;
/** Connector secret for the ideas@ Gmail connection. */
const CONN_SECRET = "GOOGLE_MAIL_API_KEY_3";
const ALLOWED_SENDER_DOMAINS = ["pedrasilva.com"];
const ALLOWED_EXT = [
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "mp4", "mov", "m4v", "webm", "pdf",
];

type Hdr = { name: string; value: string };
type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
  headers?: Hdr[];
};

function flatten(p: GmailPart | undefined): GmailPart[] {
  if (!p) return [];
  return [p, ...(p.parts ?? []).flatMap(flatten)];
}
function header(h: Hdr[] | undefined, name: string) {
  return h?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}
function decode(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function parseFrom(from: string | null): { name: string | null; email: string | null } {
  if (!from) return { name: null, email: null };
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  const e = from.match(/[^\s<>]+@[^\s<>]+/);
  return { name: null, email: e ? e[0].toLowerCase() : null };
}
function ext(filename: string) {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}
function mimeFor(e: string, fallback?: string) {
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", heif: "image/heif", mp4: "video/mp4",
    mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", pdf: "application/pdf",
  };
  return map[e] ?? fallback ?? "application/octet-stream";
}

async function gmail(path: string, connKey: string, lovableKey: string) {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail gateway ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export const Route = createFileRoute("/api/public/hooks/marketing-intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-intake-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!provided) return new Response("Unauthorized", { status: 401 });

        const lovableKey = process.env.LOVABLE_API_KEY;
        const connKey = process.env[CONN_SECRET];
        if (!lovableKey || !connKey) {
          return Response.json(
            { ok: false, error: `Gmail connector not linked (${CONN_SECRET} missing)` },
            { status: 503 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ok, error: gateErr } = await supabaseAdmin.rpc(
          "marketing_intake_secret_matches" as never,
          { p_secret: provided } as never,
        );
        if (gateErr) return new Response("Intake gate unavailable", { status: 503 });
        if (ok !== true) return new Response("Unauthorized", { status: 401 });

        const summary = { scanned: 0, created: 0, ignored: 0, skipped: 0, errors: [] as string[] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;

        let userMap: Map<string, string> | null = null;
        const lookupUser = async (email: string) => {
          if (!userMap) {
            userMap = new Map();
            for (let page = 1; page <= 20; page++) {
              const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
              if (error) throw new Error(`user lookup: ${error.message}`);
              for (const u of data.users) if (u.email) userMap.set(u.email.toLowerCase(), u.id);
              if (data.users.length < 200) break;
            }
          }
          return userMap.get(email.toLowerCase()) ?? null;
        };

        try {
          const list = await gmail(
            `/users/me/messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(
              "in:inbox newer_than:14d -from:me",
            )}`,
            connKey,
            lovableKey,
          );
          const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
          if (ids.length === 0) return Response.json({ ok: true, ...summary });

          const [{ data: caps }, { data: ign }] = await Promise.all([
            db.from("marketing_captures").select("source_message_id").in("source_message_id", ids),
            db.from("marketing_email_ignored").select("message_id").in("message_id", ids),
          ]);
          const seen = new Set<string>([
            ...((caps ?? []) as Array<{ source_message_id: string }>).map((r) => r.source_message_id),
            ...((ign ?? []) as Array<{ message_id: string }>).map((r) => r.message_id),
          ]);

          for (const id of ids) {
            if (seen.has(id)) { summary.skipped++; continue; }
            summary.scanned++;
            try {
              const msg = await gmail(`/users/me/messages/${id}?format=full`, connKey, lovableKey);
              const headers = msg.payload?.headers as Hdr[] | undefined;
              const fromRaw = header(headers, "From");
              const subject = header(headers, "Subject") ?? "";
              const { name, email } = parseFrom(fromRaw);
              const domain = email?.split("@")[1] ?? "";

              if (!email || !ALLOWED_SENDER_DOMAINS.includes(domain)) {
                await db.from("marketing_email_ignored").insert({
                  message_id: id, from_address: fromRaw, subject, reason: "external_sender",
                });
                summary.ignored++;
                continue;
              }

              const parts = flatten(msg.payload as GmailPart);
              let plain: string | null = null;
              let html: string | null = null;
              for (const p of parts) {
                if (p.filename || !p.body?.data) continue;
                if (p.mimeType === "text/plain" && plain === null) plain = decode(p.body.data);
                else if (p.mimeType === "text/html" && html === null) html = decode(p.body.data);
              }
              const body = (plain ?? (html ? htmlToText(html) : "")).trim();

              const skipped: Array<{ filename: string; reason: string }> = [];
              const accepted: GmailPart[] = [];
              for (const p of parts) {
                if (!p.filename || !p.body?.attachmentId) continue;
                const e = ext(p.filename);
                const size = p.body.size ?? 0;
                const disp = (header(p.headers, "Content-Disposition") ?? "").toLowerCase();
                const isInline = disp.startsWith("inline") || !!header(p.headers, "Content-ID");
                const isImage = (p.mimeType ?? "").startsWith("image/");
                if (!ALLOWED_EXT.includes(e)) skipped.push({ filename: p.filename, reason: "unsupported_type" });
                else if (isImage && isInline && size < INLINE_IMAGE_MAX_BYTES)
                  skipped.push({ filename: p.filename, reason: "inline_image" });
                else if (size > MAX_ATTACHMENT_BYTES)
                  skipped.push({ filename: p.filename, reason: "attachment_too_large" });
                else accepted.push(p);
              }

              if (!body && accepted.length === 0) {
                await db.from("marketing_email_ignored").insert({
                  message_id: id, from_address: fromRaw, subject, reason: "empty",
                });
                summary.ignored++;
                continue;
              }

              const captureId = crypto.randomUUID();
              const assets: Array<Record<string, unknown>> = [];
              for (const p of accepted) {
                const att = await gmail(
                  `/users/me/messages/${id}/attachments/${p.body!.attachmentId}`,
                  connKey,
                  lovableKey,
                );
                const buf = Buffer.from(String(att.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
                const safe = p.filename!.replace(/[^a-zA-Z0-9._-]/g, "_");
                const path = `${captureId}/${crypto.randomUUID()}-${safe}`;
                const mime = mimeFor(ext(p.filename!), p.mimeType);
                const { error: upErr } = await supabaseAdmin.storage
                  .from(BUCKET)
                  .upload(path, buf, { contentType: mime, upsert: true });
                if (upErr) throw new Error(`upload ${p.filename}: ${upErr.message}`);
                assets.push({
                  capture_id: captureId, storage_path: path, file_name: p.filename,
                  mime_type: mime, size_bytes: buf.length,
                });
              }

              const rawText = `Subject: ${subject}\n\n${body}`.slice(0, MAX_TEXT);
              const { error: capErr } = await db.from("marketing_captures").insert({
                id: captureId,
                channel: "email",
                created_by: await lookupUser(email),
                sender_email: email,
                sender_name: name ?? email,
                source_message_id: id,
                raw_text: rawText,
                received_at: msg.internalDate
                  ? new Date(Number(msg.internalDate)).toISOString()
                  : new Date().toISOString(),
              });
              if (capErr) {
                if (capErr.code === "23505") { summary.skipped++; continue; }
                throw new Error(`capture insert: ${capErr.message}`);
              }
              if (assets.length) {
                const { error: aErr } = await db.from("marketing_capture_assets").insert(assets);
                if (aErr) summary.errors.push(`${id}: assets insert: ${aErr.message}`);
              }
              if (skipped.length) {
                await db.from("marketing_email_ignored").insert(
                  skipped.map((s) => ({
                    message_id: id, capture_id: captureId, from_address: fromRaw, subject,
                    attachment_filename: s.filename, reason: s.reason,
                  })),
                );
                summary.ignored += skipped.length;
              }
              summary.created++;
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
