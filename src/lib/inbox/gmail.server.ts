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
