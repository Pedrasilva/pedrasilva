/**
 * PSA-only recipient rule (server-only). Only documents addressed to PSA stay
 * in the finance intake; documents clearly addressed to someone else are
 * removed ("Eliminados", restorable for 30 days, then purged). Unreadable or
 * missing recipients go to Triagem and are never auto-removed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mentionsFirm, sameVat } from "@/lib/finance/doc-intake.server";

export const REMOVAL_DAYS = 30;

export type PsaIdentity = { vat: string | null; name: string | null; variants: string[] };

export async function loadPsaIdentity(): Promise<PsaIdentity> {
  const { data } = await supabaseAdmin
    .from("pm_invoice_settings")
    .select("company_nif, company_name, company_name_variants, singleton")
    .order("singleton", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    vat: data?.company_nif ?? null,
    name: data?.company_name ?? null,
    variants: (data?.company_name_variants as string[] | null) ?? [],
  };
}

const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(lda|ltda|unipessoal|sa)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Placeholder names that say nothing about who the customer is. */
const NO_NAME = /^(consumidor final|cliente|client|customer|n a|na|desconhecido|unknown)$/;
/** A bare street address is a location, not an entity. */
const ADDRESS_ONLY = /^(rua|r|av|avenida|travessa|tv|largo|praca|estrada|alameda|calcada)\b[^a-z]*[a-z\s]*\d+[\s\w]*$/;

export function isPsaName(name: string | null | undefined, psa: PsaIdentity): boolean {
  const n = norm(name);
  if (!n) return false;
  // PSA's own mailbox printed as the addressee.
  if (/@pedrasilva\.com\b/i.test(String(name))) return true;
  if (psa.variants.some((v) => norm(v) && ` ${n} `.includes(` ${norm(v)} `))) return true;
  return mentionsFirm(name, psa.name);
}

export type RecipientDecision =
  | { kind: "psa" }
  | { kind: "skip" }
  | { kind: "triage" }
  | { kind: "remove"; reason: string };

export function decideRecipient(o: {
  psa: PsaIdentity;
  name: string | null;
  vat: string | null;
  sellerName?: string | null;
  sellerVat?: string | null;
  direction: string;
  type: string | null;
  forcedType: string | null;
  verify: boolean;
  keep: boolean;
}): RecipientDecision {
  if (o.keep || o.forcedType) return { kind: "psa" };
  if (o.type === "nao_financeiro") return { kind: "skip" };
  // Documents PSA issued name its client as recipient.
  if (o.direction === "issued" || o.type === "fatura_emitida") return { kind: "psa" };
  if ((o.sellerVat && o.psa.vat && sameVat(o.sellerVat, o.psa.vat)) || isPsaName(o.sellerName, o.psa)) return { kind: "psa" };
  if (o.verify) return { kind: "triage" };
  const name = o.name && !NO_NAME.test(norm(o.name)) && !ADDRESS_ONLY.test(norm(o.name)) ? o.name.trim() : null;
  if (o.vat) {
    if (o.psa.vat && sameVat(o.vat, o.psa.vat)) return { kind: "psa" };
    return { kind: "remove", reason: removalReason(name, o.vat) };
  }
  if (name) {
    if (isPsaName(name, o.psa)) return { kind: "psa" };
    return { kind: "remove", reason: removalReason(name, null) };
  }
  return { kind: "triage" };
}

export const removalReason = (name: string | null, vat: string | null) =>
  `Destinatário não é a PSA: ${name ?? "—"}${vat ? ` (${vat})` : ""}`;

export function removeColumns(o: { reason: string; source: string; tag?: string | null; by?: string | null; prevStatus?: string | null }) {
  return {
    status: "removed" as const,
    removed_at: new Date().toISOString(),
    removed_by: o.by ?? null,
    removed_source: o.source,
    removed_reason: o.reason,
    removed_tag: o.tag ?? null,
    removed_prev_status: o.prevStatus ?? "pending_review",
  };
}

const nifKey = (v: string | null | undefined) =>
  (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PT/, "").toLowerCase() || null;

function senderMatches(scope: string, sender: string | null) {
  if (!sender) return false;
  const email = sender.toLowerCase();
  if (scope.includes("@")) return scope === email;
  const domain = email.split("@")[1] ?? "";
  return domain === scope || domain.endsWith(`.${scope}`);
}

export type RemovalRule = { id: string; text: string; scope_type: string; scope_value: string | null };

export async function loadRemovalRules(): Promise<RemovalRule[]> {
  const { data } = await supabaseAdmin
    .from("finance_intake_instructions")
    .select("id, text, scope_type, scope_value")
    .eq("active", true)
    .eq("action", "remove");
  return (data ?? []) as RemovalRule[];
}

/** First active deletion rule that applies (recipient / supplier / sender scope). */
export function matchRemovalRule(
  rules: RemovalRule[],
  d: { recipientVat: string | null; supplierVat: string | null; sender: string | null },
): RemovalRule | null {
  return (
    rules.find((r) => {
      const v = r.scope_value ?? "";
      if (r.scope_type === "recipient_nif") return nifKey(d.recipientVat) === v;
      if (r.scope_type === "supplier_nif") return nifKey(d.supplierVat) === v;
      if (r.scope_type === "sender") return senderMatches(v, d.sender);
      return false;
    }) ?? null
  );
}

/**
 * Permanently delete items removed more than 30 days ago: stored file (when no
 * other item shares it), extracted data and queue item; one deletion-log row.
 */
export async function purgeExpiredRemoved(limit = 200) {
  const cutoff = new Date(Date.now() - REMOVAL_DAYS * 86400000).toISOString();
  const { data: rows } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, source_bucket, source_file_url, removed_reason, removed_at, removed_source")
    .eq("status", "removed")
    .lt("removed_at", cutoff)
    .limit(limit);
  if (!rows?.length) return { purged: 0 };
  const ids = rows.map((r) => r.id);
  const paths = [...new Set(rows.map((r) => r.source_file_url).filter(Boolean) as string[])];
  const { data: shared } = paths.length
    ? await supabaseAdmin
        .from("financial_document_review_queue")
        .select("source_file_url")
        .in("source_file_url", paths)
        .not("id", "in", `(${ids.join(",")})`)
    : { data: [] };
  const keep = new Set((shared ?? []).map((s) => s.source_file_url));
  const byBucket = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.source_file_url || keep.has(r.source_file_url)) continue;
    const b = r.source_bucket ?? "financial-documents";
    byBucket.set(b, [...new Set([...(byBucket.get(b) ?? []), r.source_file_url])]);
  }
  for (const [b, p] of byBucket) await supabaseAdmin.storage.from(b).remove(p);
  const { error } = await supabaseAdmin.from("financial_document_review_queue").delete().in("id", ids);
  if (error) return { purged: 0, error: error.message };
  await supabaseAdmin.from("finance_intake_deletion_log").insert({
    deleted_count: ids.length,
    criteria: { kind: "removed_after_30_days", cutoff },
    deleted_items: rows.map((r) => ({ id: r.id, reason: r.removed_reason, removed_at: r.removed_at, source: r.removed_source })),
    deleted_by_label: "Automatic purge (30 days)",
  });
  return { purged: ids.length };
}
