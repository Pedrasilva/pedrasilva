/**
 * Incoming payments ("recebimentos"), server-only. A recebimento groups every
 * proof of one incoming payment (client transfer proof, PSA bank's nota de
 * lançamento, receipts) with the bank credit line(s) and what it pays.
 * Everything here only SUGGESTS; nothing is marked paid until a person
 * confirms (see confirmRecebimento in recebimentos.functions.ts).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isPsaParty, loadPsaIdentity, type Party, type PsaIdentity } from "@/lib/finance/recipient-rule.server";
import { sameVat } from "@/lib/finance/doc-intake.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const PAYMENT_PROOF_TYPES = ["comprovativo_pagamento", "recibo", "nota_lancamento"] as const;
const AMOUNT_TOL = 0.01;
const DATE_TOL_DAYS = 5;
const TARGET_WINDOW_DAYS = 120;

export const ibanKey = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const nifKey = (v: string | null | undefined) =>
  (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PT/, "") || null;
export const nameKey = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(lda|ltda|unipessoal|unip|sa|s a|limitada|sociedade|soc)\b/g, " ")
    .replace(/\s+/g, " ").trim();

const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export type PaymentParties = {
  payer: Party;
  beneficiary: Party;
  description: string | null;
};

/** PSA beneficiary → incoming; PSA payer → outgoing; otherwise unknown. */
export function paymentDirection(p: PaymentParties, psa: PsaIdentity): "incoming" | "outgoing" | null {
  const payerPsa = isPsaParty(p.payer, psa);
  const benPsa = isPsaParty(p.beneficiary, psa);
  if (benPsa && !payerPsa) return "incoming";
  if (payerPsa && !benPsa) return "outgoing";
  return null;
}

export type ClientMatch = {
  companyId: string | null;
  method: "nif" | "iban" | "name" | null;
  detail: string | null;
  /** Several companies fit the name → a person must choose. */
  ambiguous?: boolean;
};

/** Payer → CRM company by NIF, then a learned IBAN, then name. */
export async function matchClient(payer: Party): Promise<ClientMatch> {
  const vat = nifKey(payer.vat);
  if (vat) {
    const { data } = await supabaseAdmin.from("companies").select("id, nome, nif").not("nif", "is", null);
    const hit = (data ?? []).filter((c) => sameVat(c.nif, vat));
    if (hit.length === 1) return { companyId: hit[0].id, method: "nif", detail: hit[0].nif };
  }
  const iban = ibanKey(payer.iban);
  if (iban.length >= 15) {
    const { data } = await supabaseAdmin.from("company_ibans").select("company_id, iban").eq("iban", iban).maybeSingle();
    if (data) return { companyId: data.company_id, method: "iban", detail: iban };
  }
  const n = nameKey(payer.name);
  if (n.length >= 3) {
    const { data } = await supabaseAdmin.from("companies").select("id, nome").eq("is_active", true);
    const exact = (data ?? []).filter((c) => nameKey(c.nome) === n);
    if (exact.length === 1) return { companyId: exact[0].id, method: "name", detail: exact[0].nome };
    if (exact.length > 1) return { companyId: null, method: null, detail: payer.name, ambiguous: true };
    const contains = (data ?? []).filter((c) => {
      const k = nameKey(c.nome);
      return k.length >= 4 && (` ${n} `.includes(` ${k} `) || ` ${k} `.includes(` ${n} `));
    });
    if (contains.length === 1) return { companyId: contains[0].id, method: "name", detail: contains[0].nome };
    if (contains.length > 1) return { companyId: null, method: null, detail: payer.name, ambiguous: true };
  }
  return { companyId: null, method: null, detail: null };
}

type QueueProof = {
  id: string; intake_type: string | null; extracted_amount: number | null; extracted_date: string | null;
  payer_name: string | null; payer_vat: string | null; payer_iban: string | null;
  payment_description: string | null; payment_direction: string | null; recebimento_id: string | null;
};

/**
 * Join an incoming proof to an existing recebimento (amount ±0.01, date ±5
 * days, same payer or client) or create a suggested one.
 */
export async function attachProof(queueItemId: string): Promise<{ recebimentoId: string | null; joined: boolean }> {
  const { data: q } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, intake_type, extracted_amount, extracted_date, payer_name, payer_vat, payer_iban, payment_description, payment_direction, recebimento_id, status")
    .eq("id", queueItemId)
    .maybeSingle();
  const row = q as (QueueProof & { status: string }) | null;
  if (!row || row.payment_direction !== "incoming") return { recebimentoId: null, joined: false };
  if (!["pending_review", "filed", "paid"].includes(row.status)) return { recebimentoId: null, joined: false };
  if (row.recebimento_id) return { recebimentoId: row.recebimento_id, joined: true };
  const amount = money(Math.abs(Number(row.extracted_amount ?? 0)));
  const date = row.extracted_date;
  if (!(amount > 0) || !date) return { recebimentoId: null, joined: false };

  const client = await matchClient({ name: row.payer_name, vat: row.payer_vat, iban: row.payer_iban });
  const { data: near } = await supabaseAdmin
    .from("finance_recebimentos")
    .select("id, company_id, payer_name, payer_vat, payer_iban, amount, received_date")
    .gte("amount", amount - AMOUNT_TOL).lte("amount", amount + AMOUNT_TOL)
    .gte("received_date", addDays(date, -DATE_TOL_DAYS)).lte("received_date", addDays(date, DATE_TOL_DAYS));
  const same = (near ?? []).find((r) =>
    (client.companyId && r.company_id === client.companyId) ||
    (row.payer_vat && r.payer_vat && sameVat(r.payer_vat, row.payer_vat)) ||
    (row.payer_iban && ibanKey(r.payer_iban) === ibanKey(row.payer_iban)) ||
    (row.payer_name && nameKey(r.payer_name) && nameKey(r.payer_name) === nameKey(row.payer_name)) ||
    // A PSA bank notice often prints only a short payer name: same amount and window + no other candidate.
    (!row.payer_name && !row.payer_vat && (near ?? []).length === 1),
  );

  let recId: string;
  let joined = false;
  if (same) {
    recId = same.id;
    joined = true;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (!same.payer_name && row.payer_name) patch.payer_name = row.payer_name;
    if (!same.payer_vat && row.payer_vat) patch.payer_vat = row.payer_vat;
    if (!same.payer_iban && row.payer_iban) patch.payer_iban = ibanKey(row.payer_iban);
    if (!same.company_id && client.companyId) { patch.company_id = client.companyId; patch.client_match_method = client.method; patch.client_match_detail = client.detail; }
    await supabaseAdmin.from("finance_recebimentos").update(patch as any).eq("id", recId);
  } else {
    const { data: ins, error } = await supabaseAdmin
      .from("finance_recebimentos")
      .insert({
        company_id: client.companyId,
        client_match_method: client.method,
        client_match_detail: client.detail,
        payer_name: row.payer_name, payer_vat: row.payer_vat, payer_iban: row.payer_iban ? ibanKey(row.payer_iban) : null,
        amount, received_date: date, description: row.payment_description,
      })
      .select("id")
      .single();
    if (error || !ins) return { recebimentoId: null, joined: false };
    recId = ins.id;
  }
  await supabaseAdmin.from("financial_document_review_queue").update({ recebimento_id: recId }).eq("id", row.id);
  await refreshSuggestions(recId);
  return { recebimentoId: recId, joined };
}

export type TargetItem = {
  kind: "pm_invoice" | "schedule_item" | "issued_document";
  id: string; label: string; amount: number; date: string | null; projectId: string | null; projectName?: string | null;
};
export type TargetSuggestion = { items: TargetItem[]; total: number; exact: boolean; hint: string | null };

/** Bank credit lines + open invoices / schedule items for a recebimento. */
export async function refreshSuggestions(recId: string) {
  const { data: rec } = await supabaseAdmin.from("finance_recebimentos").select("*").eq("id", recId).maybeSingle();
  if (!rec || rec.status === "confirmed") return;
  const amount = money(rec.amount);
  const date = rec.received_date as string;

  // Bank: credit lines on PSA accounts, same amount, ±5 days, not yet reconciled.
  const { data: tx } = await supabaseAdmin
    .from("bank_transactions")
    .select("id, transaction_date, amount, reconciled_at")
    .gte("amount", amount - AMOUNT_TOL).lte("amount", amount + AMOUNT_TOL)
    .gte("transaction_date", addDays(date, -DATE_TOL_DAYS)).lte("transaction_date", addDays(date, DATE_TOL_DAYS))
    .is("reconciled_at", null);
  const { data: taken } = await supabaseAdmin.from("finance_recebimentos").select("id, bank_transaction_ids").eq("status", "confirmed");
  const used = new Set((taken ?? []).flatMap((r) => r.bank_transaction_ids ?? []));
  const bankIds = (tx ?? [])
    .filter((t) => !used.has(t.id))
    .sort((a, b) => dayDiff(a.transaction_date, date) - dayDiff(b.transaction_date, date))
    .map((t) => t.id);

  const targets = await findTargets(rec.company_id, amount, date, rec.description);
  await supabaseAdmin
    .from("finance_recebimentos")
    .update({ suggested_bank_transaction_ids: bankIds, suggested_targets: targets as any, updated_at: new Date().toISOString() })
    .eq("id", recId);
}

/** Open things the client could be paying, gross (VAT included). */
export async function openTargetsForClient(companyId: string): Promise<TargetItem[]> {
  const { data: company } = await supabaseAdmin.from("companies").select("id, nif").eq("id", companyId).maybeSingle();
  const { data: projects } = await supabaseAdmin.from("pm_projects").select("id, name").eq("company_id", companyId);
  const pIds = (projects ?? []).map((p) => p.id);
  const pName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const out: TargetItem[] = [];

  let invQ = supabaseAdmin.from("pm_invoices").select("id, invoice_number, title, total, raised_date, due_date, project_id, status, client_nif")
    .in("status", ["draft", "sent", "overdue"]);
  if (pIds.length) invQ = invQ.or(`project_id.in.(${pIds.join(",")})${company?.nif ? `,client_nif.eq.${company.nif}` : ""}`);
  else if (company?.nif) invQ = invQ.eq("client_nif", company.nif);
  else invQ = invQ.eq("id", "00000000-0000-0000-0000-000000000000");
  const { data: invs } = await invQ;
  for (const i of invs ?? []) {
    out.push({ kind: "pm_invoice", id: i.id, label: i.invoice_number ?? i.title ?? "—", amount: money(i.total), date: i.due_date ?? i.raised_date, projectId: i.project_id, projectName: pName.get(i.project_id) ?? null });
  }
  if (pIds.length) {
    const { data: sch } = await supabaseAdmin.from("pm_payment_schedule_items")
      .select("id, label, amount_type, amount_value, vat_rate, expected_payment_date, expected_invoice_date, project_id, billing_status, direction")
      .in("project_id", pIds).eq("direction", "inflow").in("billing_status", ["planned", "issued"]).eq("amount_type", "fixed");
    for (const s of sch ?? []) {
      const rate = Number(s.vat_rate ?? 0);
      const gross = money(Number(s.amount_value ?? 0) * (1 + (rate > 1 ? rate / 100 : rate)));
      out.push({ kind: "schedule_item", id: s.id, label: s.label ?? "—", amount: gross, date: s.expected_payment_date ?? s.expected_invoice_date, projectId: s.project_id, projectName: pName.get(s.project_id) ?? null });
    }
  }
  const { data: docs } = await supabaseAdmin.from("financial_documents")
    .select("id, document_number, total_inc_vat, outstanding_amount, issue_date, due_date, project_id, status, doc_type")
    .eq("direction", "issued").eq("counterparty_client_id", companyId).neq("status", "cancelled")
    .in("doc_type", ["client_invoice"]).gt("outstanding_amount", 0);
  for (const d of docs ?? []) {
    out.push({ kind: "issued_document", id: d.id, label: d.document_number ?? "—", amount: money(d.outstanding_amount ?? d.total_inc_vat), date: d.due_date ?? d.issue_date, projectId: d.project_id, projectName: d.project_id ? pName.get(d.project_id) ?? null : null });
  }
  return out;
}

async function findTargets(companyId: string | null, amount: number, date: string, description: string | null): Promise<TargetSuggestion[]> {
  if (!companyId) return [];
  const all = (await openTargetsForClient(companyId)).filter((t) => !t.date || dayDiff(t.date, date) <= TARGET_WINDOW_DAYS);
  const desc = nameKey(description);
  const hintOf = (items: TargetItem[]) => {
    if (!desc) return null;
    const num = items.find((i) => i.label && i.label.length >= 3 && desc.includes(nameKey(i.label)));
    if (num) return `ref:${num.label}`;
    if (/adjudica/.test(desc) && items.some((i) => /adjudica/.test(nameKey(i.label)))) return "adjudicacao";
    return null;
  };
  const res: TargetSuggestion[] = [];
  const eq = (x: number) => Math.abs(x - amount) <= AMOUNT_TOL;
  for (const t of all) if (eq(t.amount)) res.push({ items: [t], total: t.amount, exact: true, hint: hintOf([t]) });
  // Combinations of 2 or 3 open items summing to the amount.
  const pool = all.slice(0, 30);
  for (let i = 0; i < pool.length && res.length < 8; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const s2 = money(pool[i].amount + pool[j].amount);
      if (eq(s2)) res.push({ items: [pool[i], pool[j]], total: s2, exact: true, hint: hintOf([pool[i], pool[j]]) });
      for (let k = j + 1; k < pool.length; k++) {
        const s3 = money(s2 + pool[k].amount);
        if (eq(s3)) res.push({ items: [pool[i], pool[j], pool[k]], total: s3, exact: true, hint: hintOf([pool[i], pool[j], pool[k]]) });
      }
    }
  const score = (s: TargetSuggestion) =>
    (s.hint ? 0 : 1000) + s.items.length * 100 + Math.min(...s.items.map((i) => (i.date ? dayDiff(i.date, date) : 99)));
  return res.sort((a, b) => score(a) - score(b)).slice(0, 6);
}

/** Store parties + direction on a queue row from an extraction. */
export async function partiesColumns(p: PaymentParties, psa?: PsaIdentity) {
  const identity = psa ?? (await loadPsaIdentity());
  return {
    payer_name: p.payer.name, payer_vat: p.payer.vat, payer_iban: p.payer.iban,
    beneficiary_name: p.beneficiary.name, beneficiary_vat: p.beneficiary.vat, beneficiary_iban: p.beneficiary.iban,
    payment_description: p.description,
    payment_direction: paymentDirection(p, identity),
  };
}

const PARTIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    payer_name: { type: ["string", "null"] }, payer_vat: { type: ["string", "null"] }, payer_iban: { type: ["string", "null"] },
    beneficiary_name: { type: ["string", "null"] }, beneficiary_vat: { type: ["string", "null"] }, beneficiary_iban: { type: ["string", "null"] },
    payment_description: { type: ["string", "null"] },
  },
  required: ["payer_name", "payer_vat", "payer_iban", "beneficiary_name", "beneficiary_vat", "beneficiary_iban", "payment_description"],
};

/**
 * Backfill-only narrow read: payer, beneficiary and description of an
 * already-read payment document (single Gemini call; the full dual read
 * already happened). Returns null when the model can't be reached.
 */
export async function readParties(o: { bucket: string; path: string; pages?: { first: number; last: number } | null }): Promise<PaymentParties | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const { loadFile, GEMINI_MODEL } = await import("@/lib/finance/intake-models.server");
  const f = await loadFile(o.bucket, o.path);
  const pageNote = o.pages ? ` Read ONLY pages ${o.pages.first}-${o.pages.last} of the file.` : "";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: [
        { role: "system", content: "You read Portuguese bank payment documents (transfer proofs, receipts, notas de lançamento / avisos de crédito ou débito). Extract exactly as printed: payer = ordenante / who sends the money (\"Ordenante\", \"Conta origem\", \"Debitado\", \"Recebemos de\", \"Cliente\" on a receipt); beneficiary = who receives it (\"Beneficiário\", \"Destinatário\", \"Conta destino\", \"Creditado\", the issuer of a receipt). On a bank credit notice the account holder is the beneficiary and the ordenante is the payer. payment_description = the transfer description / descritivo / referência exactly as printed. null when not printed." },
        { role: "user", content: [
          { type: "text", text: `Extract payer, beneficiary and description.${pageNote}` },
          { type: "image_url", image_url: { url: `data:${f.mime};base64,${f.b64}` } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: { name: "payment_parties", strict: true, schema: PARTIES_SCHEMA } },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const c = json.choices?.[0]?.message?.content;
  if (!c) return null;
  const o2 = JSON.parse(c) as Record<string, string | null>;
  return {
    payer: { name: o2.payer_name ?? null, vat: o2.payer_vat ?? null, iban: o2.payer_iban ?? null },
    beneficiary: { name: o2.beneficiary_name ?? null, vat: o2.beneficiary_vat ?? null, iban: o2.beneficiary_iban ?? null },
    description: o2.payment_description ?? null,
  };
}
