/**
 * CRM email intake — threads labelled "CRM" in luis@pedrasilva.com become
 * lead drafts (crm_email_lead_drafts). Polled by pg_cron every 10 minutes;
 * the gate token lives in the service-role-only crm_email_intake_gate table.
 *
 * Guarantees:
 *  - Only threads with the "CRM" label are read.
 *  - Nothing is written to contacts/companies/crm_opportunities/crm_activities
 *    here — that happens only in crm_email_lead_confirm (a person clicks Confirmar).
 *  - The only Gmail write is adding the "CRM/Importado" label.
 *  - Each message is turned into a draft once (crm_email_threads.processed_message_ids);
 *    a new message in an already-imported thread becomes a "reply" draft (activity only).
 *  - Attachments are listed by name, never downloaded.
 */
import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";
const CLAUDE_MODEL = "anthropic/claude-sonnet-5";
/** Connector secret for the luis@pedrasilva.com Gmail connection. */
const CONN_SECRET = "GOOGLE_MAIL_API_KEY";
const MAILBOX = "luis@pedrasilva.com";
const LABEL = "CRM";
const IMPORTED_LABEL = "CRM/Importado";
const MAX_THREADS = 10;
const MAX_TEXT = 15_000;

type Hdr = { name: string; value: string };
type Part = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string };
  parts?: Part[];
  headers?: Hdr[];
};
type Msg = { id: string; internalDate?: string; payload?: Part };

const flatten = (p: Part | undefined): Part[] => (p ? [p, ...(p.parts ?? []).flatMap(flatten)] : []);
const header = (h: Hdr[] | undefined, n: string) =>
  h?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? null;
const decode = (d: string) => Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const htmlToText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
function bodyText(p: Part | undefined) {
  const parts = flatten(p);
  const plain = parts.find((x) => x.mimeType === "text/plain" && x.body?.data && !x.filename);
  if (plain) return decode(plain.body!.data!);
  const html = parts.find((x) => x.mimeType === "text/html" && x.body?.data && !x.filename);
  return html ? htmlToText(decode(html.body!.data!)) : "";
}
function parseAddr(v: string | null) {
  if (!v) return { name: null as string | null, email: null as string | null };
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  const e = v.match(/[^\s<>,]+@[^\s<>,]+/);
  return { name: null, email: e ? e[0].toLowerCase() : null };
}

async function gmail(path: string, connKey: string, lovableKey: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail gateway ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function ensureLabel(name: string, connKey: string, lovableKey: string): Promise<string> {
  const { labels = [] } = (await gmail("/users/me/labels", connKey, lovableKey)) as {
    labels?: Array<{ id: string; name: string }>;
  };
  const found = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const created = (await gmail("/users/me/labels", connKey, lovableKey, {
    method: "POST",
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  })) as { id: string };
  return created.id;
}

const FIELDS = [
  "contact_name", "email", "phone", "company", "role", "project_type",
  "location", "size", "budget", "timing", "how_found",
] as const;

const SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(FIELDS.map((f) => [f, { type: ["string", "null"] }])),
    summary: { type: "string", description: "Two short lines in Portuguese (PT-PT) summarising the enquiry." },
    next_action: { type: ["string", "null"], description: "Short suggested next step for PSA, in Portuguese." },
    mentioned_date: { type: ["string", "null"], description: "A follow-up/meeting date explicitly mentioned in the email, YYYY-MM-DD, else null." },
  },
  required: [...FIELDS, "summary", "next_action", "mentioned_date"],
};

const SYSTEM = `You read emails sent to Pedra Silva Arquitectos (PSA), an architecture studio, and extract a sales lead.
Rules:
- Extract only what is written in the email. NEVER invent or guess. If a field is not in the email, return null.
- The contact is the external person enquiring (not anyone @pedrasilva.com). Take role/phone/company from their signature when present.
- "how_found" = how they say they found PSA (referral, website, Instagram, ...), else null.
- summary: two short lines in European Portuguese.`;

/** Claude via the gateway's native Messages API, streamed, schema forced as a tool. */
async function extract(text: string, lovableKey: string): Promise<Record<string, string | null>> {
  const res = await fetch(`${AI_GATEWAY}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      stream: true,
      system: SYSTEM,
      tools: [{ name: "crm_lead", description: "Return the extracted lead.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "crm_lead" },
      messages: [{ role: "user", content: [{ type: "text", text }] }],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let json = "";
  let buf = "";
  let streamErr: string | null = null;
  const dec = new TextDecoder();
  const reader = res.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(5));
        if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") json += ev.delta.partial_json;
        else if (ev.type === "error") streamErr = ev.error?.message ?? "stream error";
      } catch { /* ignore */ }
    }
  }
  if (streamErr) throw new Error(streamErr);
  if (!json) throw new Error("Empty model answer");
  return JSON.parse(json);
}

function addWorkingDays(from: Date, n: number, holidays: Set<string>) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(iso)) left--;
  }
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/hooks/crm-email-intake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-intake-secret") ?? "";
        if (!provided) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: gate } = await db.from("crm_email_intake_gate").select("token").eq("id", 1).maybeSingle();
        const { timingSafeEqual } = await import("node:crypto");
        const a = Buffer.from(provided);
        const b = Buffer.from(gate?.token ?? "");
        if (!gate?.token || a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const connKey = process.env[CONN_SECRET];
        if (!lovableKey || !connKey) {
          return Response.json({ ok: false, error: `Gmail connector not linked (${CONN_SECRET} missing)` }, { status: 503 });
        }

        const summary = { threads: 0, leads: 0, replies: 0, skipped: 0, errors: [] as string[] };
        try {
          await ensureLabel(LABEL, connKey, lovableKey);
          const importedId = await ensureLabel(IMPORTED_LABEL, connKey, lovableKey);

          // Owner = the mailbox's person.
          let ownerId: string | null = null;
          for (let page = 1; page <= 5 && !ownerId; page++) {
            const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
            ownerId = data?.users.find((u) => u.email?.toLowerCase() === MAILBOX)?.id ?? null;
            if (!data || data.users.length < 200) break;
          }

          const { data: hol } = await db.from("holidays").select("data").gte("data", new Date().toISOString().slice(0, 10));
          const holidays = new Set((hol ?? []).map((h) => h.data));

          const list = (await gmail(
            `/users/me/threads?maxResults=${MAX_THREADS}&q=${encodeURIComponent(`label:${LABEL}`)}`,
            connKey,
            lovableKey,
          )) as { threads?: Array<{ id: string }> };

          for (const { id: threadId } of list.threads ?? []) {
            summary.threads++;
            try {
              const thread = (await gmail(`/users/me/threads/${threadId}?format=full`, connKey, lovableKey)) as { messages?: Msg[] };
              const messages = thread.messages ?? [];
              const { data: state } = await db
                .from("crm_email_threads")
                .select("processed_message_ids, first_draft_id")
                .eq("mailbox", MAILBOX)
                .eq("thread_id", threadId)
                .maybeSingle();
              const done = new Set(state?.processed_message_ids ?? []);
              const fresh = messages.filter((m) => !done.has(m.id));
              if (!fresh.length) { summary.skipped++; continue; }

              const isReply = !!state;
              const first = messages[0];
              const firstHdr = first?.payload?.headers;
              const subject = header(firstHdr, "Subject");
              // The enquirer: first non-PSA sender in the thread.
              const external = messages
                .map((m) => parseAddr(header(m.payload?.headers, "From")))
                .find((a) => a.email && !a.email.endsWith("@pedrasilva.com"));
              const from = external ?? parseAddr(header(firstHdr, "From"));

              const textOf = (m: Msg) => {
                const h = m.payload?.headers;
                return `From: ${header(h, "From") ?? ""}\nTo: ${header(h, "To") ?? ""}\nDate: ${header(h, "Date") ?? ""}\nSubject: ${header(h, "Subject") ?? ""}\n\n${bodyText(m.payload)}`;
              };
              const emailText = fresh.map(textOf).join("\n\n-----\n\n").slice(0, MAX_TEXT);
              const attachments = fresh.flatMap((m) =>
                flatten(m.payload).filter((p) => p.filename && p.body?.attachmentId).map((p) => p.filename!),
              );
              const lastFresh = fresh[fresh.length - 1];
              const receivedAt = lastFresh.internalDate ? new Date(Number(lastFresh.internalDate)).toISOString() : null;

              let x: Record<string, string | null> = {};
              let modelError: string | null = null;
              try {
                x = await extract(isReply ? `${messages.map(textOf).join("\n\n-----\n\n").slice(0, MAX_TEXT)}` : emailText, lovableKey);
              } catch (e) {
                modelError = e instanceof Error ? e.message : String(e);
              }
              const extracted = Object.fromEntries(FIELDS.map((f) => [f, x[f] ?? null]));
              if (!extracted.email && from.email) extracted.email = from.email;
              if (!extracted.contact_name && from.name) extracted.contact_name = from.name;

              // Match: contact by email → company by domain or name → open opportunity.
              let contactId: string | null = null;
              let companyId: string | null = null;
              let oppId: string | null = null;
              const reasons: string[] = [];
              const email = (extracted.email ?? "").toLowerCase();
              if (email) {
                const { data: c } = await db.from("contacts").select("id, company_id").ilike("email", email).limit(1).maybeSingle();
                if (c) { contactId = c.id; companyId = c.company_id; reasons.push("contact:email"); }
              }
              const domain = email.split("@")[1] ?? "";
              const generic = /^(gmail|hotmail|outlook|live|yahoo|icloud|me|sapo|msn|aol|proton(mail)?)\./i.test(domain);
              if (!companyId && domain && !generic) {
                const { data: co } = await db
                  .from("companies")
                  .select("id")
                  .or(`email.ilike.%@${domain},website.ilike.%${domain}%`)
                  .limit(1)
                  .maybeSingle();
                if (co) { companyId = co.id; reasons.push("company:domain"); }
              }
              if (!companyId && extracted.company) {
                const { data: co } = await db.from("companies").select("id").ilike("nome", extracted.company.trim()).limit(1).maybeSingle();
                if (co) { companyId = co.id; reasons.push("company:name"); }
              }
              if (isReply && state?.first_draft_id) {
                const { data: fd } = await db
                  .from("crm_email_lead_drafts")
                  .select("result_opportunity_id, matched_opportunity_id")
                  .eq("id", state.first_draft_id)
                  .maybeSingle();
                oppId = fd?.result_opportunity_id ?? fd?.matched_opportunity_id ?? null;
                if (oppId) reasons.push("opportunity:thread");
              }
              if (!oppId && (contactId || email)) {
                let q = db.from("crm_opportunities").select("id").not("stage", "in", "(won,lost)").order("updated_at", { ascending: false }).limit(1);
                q = contactId ? q.eq("primary_contact_id", contactId) : q.ilike("contact_email", email);
                const { data: o } = await q.maybeSingle();
                if (o) { oppId = o.id; reasons.push("opportunity:contact"); }
              }

              const mentioned = typeof x.mentioned_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.mentioned_date) && x.mentioned_date >= new Date().toISOString().slice(0, 10) ? x.mentioned_date : null;
              const nextDate = mentioned ?? addWorkingDays(new Date(), 2, holidays);

              const { data: draft, error: dErr } = await db
                .from("crm_email_lead_drafts")
                .insert({
                  kind: isReply ? "reply" : "lead",
                  mailbox: MAILBOX,
                  thread_id: threadId,
                  gmail_message_ids: fresh.map((m) => m.id),
                  subject,
                  from_address: from.email,
                  received_at: receivedAt,
                  email_text: emailText,
                  attachment_names: attachments,
                  extracted,
                  summary: (x.summary as string | null) ?? null,
                  matched_contact_id: contactId,
                  matched_company_id: companyId,
                  matched_opportunity_id: oppId,
                  match_reason: reasons.join(",") || null,
                  suggested_next_action: (x.next_action as string | null) ?? null,
                  suggested_next_action_date: nextDate,
                  owner_id: ownerId,
                  model_error: modelError,
                })
                .select("id")
                .single();
              if (dErr) throw dErr;

              await db.from("crm_email_threads").upsert({
                mailbox: MAILBOX,
                thread_id: threadId,
                processed_message_ids: messages.map((m) => m.id),
                first_draft_id: state?.first_draft_id ?? draft.id,
                updated_at: new Date().toISOString(),
              });
              await gmail(`/users/me/threads/${threadId}/modify`, connKey, lovableKey, {
                method: "POST",
                body: JSON.stringify({ addLabelIds: [importedId] }),
              });

              if (ownerId) {
                const who = extracted.contact_name ?? from.email ?? subject ?? "email";
                await db.from("notifications").insert({
                  user_id: ownerId,
                  kind: "crm_email_lead",
                  module: "crm",
                  entity_type: "crm_email_lead_draft",
                  entity_id: draft.id,
                  title: isReply
                    ? `Nova resposta de ${who} · New reply from ${who}`
                    : `Novo lead de email: ${who} · New email lead: ${who}`,
                  body: ((x.summary as string | null) ?? subject ?? "").slice(0, 300),
                  link_path: "/crm/email-leads",
                  dedupe_key: `crm_email_lead:${draft.id}`,
                });
              }
              if (isReply) summary.replies++;
              else summary.leads++;
            } catch (e) {
              summary.errors.push(`${threadId}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        } catch (e) {
          summary.errors.push(e instanceof Error ? e.message : String(e));
        }
        return Response.json({ ok: summary.errors.length === 0, ...summary });
      },
    },
  },
});
