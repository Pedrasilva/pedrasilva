/**
 * Server-only Gmail helpers for the Inbox triage queue.
 *
 * Every call goes through the Lovable connector gateway using the per-inbox
 * connector secret named on `email_sync_state.connector_secret_name`.
 * Nothing here runs automatically — each function is invoked by an explicit
 * user action in the review queue.
 */
const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export type GmailContext = { connKey: string; lovableKey: string };

function lovableKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

async function gmailFetch(
  path: string,
  ctx: GmailContext,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ctx.lovableKey}`,
      "X-Connection-Api-Key": ctx.connKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gmail gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

type Inbox = { inbox_address: string; connector_secret_name: string | null };

/**
 * Find which connected inbox owns a message. Active inboxes are probed one by
 * one with a cheap metadata read; the first that can see the message wins.
 */
export async function resolveInboxForMessage(
  inboxes: Inbox[],
  gmailMessageId: string,
): Promise<GmailContext> {
  const key = lovableKey();
  const errors: string[] = [];
  for (const inbox of inboxes) {
    const connKey = inbox.connector_secret_name
      ? process.env[inbox.connector_secret_name]
      : undefined;
    if (!connKey) {
      errors.push(`${inbox.inbox_address}: connector secret not available`);
      continue;
    }
    const ctx = { connKey, lovableKey: key };
    try {
      await gmailFetch(
        `/users/me/messages/${gmailMessageId}?format=minimal`,
        ctx,
      );
      return ctx;
    } catch (err) {
      errors.push(
        `${inbox.inbox_address}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new Error(
    errors.length
      ? `No connected inbox could read this message — ${errors.join("; ")}`
      : "No active inbox is connected",
  );
}

function header(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
): string | null {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    null
  );
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Send `body` as a reply on the original thread. Requires `gmail.send`. */
export async function sendReply(
  ctx: GmailContext,
  args: { gmailMessageId: string; threadId: string; body: string },
): Promise<{ id: string }> {
  const original = (await gmailFetch(
    `/users/me/messages/${args.gmailMessageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Reply-To`,
    ctx,
  )) as { payload?: { headers?: Array<{ name: string; value: string }> } };

  const headers = original.payload?.headers;
  const to = header(headers, "Reply-To") ?? header(headers, "From");
  if (!to) throw new Error("Original message has no sender address");
  const subject = header(headers, "Subject") ?? "";
  const messageId = header(headers, "Message-ID");
  const references = header(headers, "References");

  const raw = [
    `To: ${to}`,
    `Subject: ${/^re:/i.test(subject) ? subject : `Re: ${subject}`}`,
    ...(messageId ? [`In-Reply-To: ${messageId}`] : []),
    ...(messageId
      ? [`References: ${references ? `${references} ${messageId}` : messageId}`]
      : []),
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    args.body,
  ].join("\r\n");

  const sent = (await gmailFetch("/users/me/messages/send", ctx, {
    method: "POST",
    body: JSON.stringify({ raw: base64url(raw), threadId: args.threadId }),
  })) as { id: string };

  return { id: sent.id };
}

/** Remove the INBOX label (archive). Requires `gmail.modify`. */
export async function archiveMessage(
  ctx: GmailContext,
  gmailMessageId: string,
): Promise<void> {
  await gmailFetch(`/users/me/messages/${gmailMessageId}/modify`, ctx, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
  });
}

/** Re-add the INBOX label (undo an archive). Requires `gmail.modify`. */
export async function unarchiveMessage(
  ctx: GmailContext,
  gmailMessageId: string,
): Promise<void> {
  await gmailFetch(`/users/me/messages/${gmailMessageId}/modify`, ctx, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: ["INBOX"] }),
  });
}

/**
 * Move to Gmail's recoverable trash (auto-purged by Gmail after 30 days).
 * Never `batchDelete` / permanent delete. Requires `gmail.modify`.
 */
export async function trashMessage(
  ctx: GmailContext,
  gmailMessageId: string,
): Promise<void> {
  await gmailFetch(`/users/me/messages/${gmailMessageId}/trash`, ctx, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Restore a trashed message (undo a trash). Requires `gmail.modify`. */
export async function untrashMessage(
  ctx: GmailContext,
  gmailMessageId: string,
): Promise<void> {
  await gmailFetch(`/users/me/messages/${gmailMessageId}/untrash`, ctx, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/* ------------------------------------------------------------------ *
 * Content view: full body + attachments, and forwarding.
 * ------------------------------------------------------------------ */

type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
  headers?: Array<{ name: string; value: string }>;
};

function flattenParts(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flattenParts)];
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

export type GmailAttachment = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type GmailMessageContent = {
  html: string | null;
  text: string | null;
  attachments: GmailAttachment[];
};

/** Full message body (HTML preferred) plus the attachment manifest. */
export async function getMessageContent(
  ctx: GmailContext,
  gmailMessageId: string,
): Promise<GmailMessageContent> {
  const msg = (await gmailFetch(
    `/users/me/messages/${gmailMessageId}?format=full`,
    ctx,
  )) as { payload?: GmailPart };

  const parts = flattenParts(msg.payload);
  let html: string | null = null;
  let text: string | null = null;
  const attachments: GmailAttachment[] = [];

  for (const p of parts) {
    const isAttachment = !!p.filename && !!p.body?.attachmentId;
    if (isAttachment) {
      attachments.push({
        attachmentId: p.body!.attachmentId!,
        filename: p.filename!,
        mimeType: p.mimeType ?? "application/octet-stream",
        size: p.body?.size ?? 0,
      });
      continue;
    }
    if (!p.body?.data) continue;
    if (p.mimeType === "text/html" && html === null) html = decodeB64Url(p.body.data);
    else if (p.mimeType === "text/plain" && text === null)
      text = decodeB64Url(p.body.data);
  }

  return { html, text, attachments };
}

/** Raw attachment bytes (base64url from Gmail, returned as base64). */
export async function getAttachment(
  ctx: GmailContext,
  gmailMessageId: string,
  attachmentId: string,
): Promise<{ base64: string }> {
  const att = (await gmailFetch(
    `/users/me/messages/${gmailMessageId}/attachments/${attachmentId}`,
    ctx,
  )) as { data?: string };
  if (!att.data) throw new Error("Attachment has no content");
  return { base64: att.data.replace(/-/g, "+").replace(/_/g, "/") };
}

/**
 * Forward the message, attachments included, by re-uploading the original
 * parts into a fresh multipart/mixed MIME message. Requires `gmail.send`.
 */
export async function forwardMessage(
  ctx: GmailContext,
  args: { gmailMessageId: string; to: string; note?: string },
): Promise<{ id: string }> {
  const msg = (await gmailFetch(
    `/users/me/messages/${args.gmailMessageId}?format=full`,
    ctx,
  )) as { payload?: GmailPart };

  const headers = msg.payload?.headers;
  const subject = header(headers, "Subject") ?? "";
  const from = header(headers, "From") ?? "";
  const date = header(headers, "Date") ?? "";
  const content = await getMessageContent(ctx, args.gmailMessageId);

  const intro = [
    args.note?.trim() ? `${args.note.trim()}\r\n` : "",
    "---------- Forwarded message ----------",
    `From: ${from}`,
    `Date: ${date}`,
    `Subject: ${subject}`,
    "",
    content.text ?? (content.html ? content.html.replace(/<[^>]+>/g, " ") : ""),
  ].join("\r\n");

  const boundary = `psa_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const chunks: string[] = [
    `To: ${args.to}`,
    `Subject: ${/^fwd:/i.test(subject) ? subject : `Fwd: ${subject}`}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    intro,
  ];

  for (const att of content.attachments) {
    const { base64 } = await getAttachment(ctx, args.gmailMessageId, att.attachmentId);
    chunks.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64.replace(/(.{76})/g, "$1\r\n"),
    );
  }
  chunks.push(`--${boundary}--`, "");

  const sent = (await gmailFetch("/users/me/messages/send", ctx, {
    method: "POST",
    body: JSON.stringify({ raw: base64url(chunks.join("\r\n")) }),
  })) as { id: string };
  return { id: sent.id };
}
