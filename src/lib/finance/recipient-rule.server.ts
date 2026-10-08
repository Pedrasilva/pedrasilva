/**
 * PSA-only recipient rule (server-only). Only documents addressed to PSA stay
 * in the finance intake; documents clearly addressed to someone else are
 * removed ("Eliminados", restorable for 30 days, then purged). Unreadable or
 * missing recipients go to Triagem and are never auto-removed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mentionsFirm, sameVat } from "@/lib/finance/doc-intake.server";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";

export const REMOVAL_DAYS = 30;

export type PsaIdentity = { vat: string | null; name: string | null; variants: string[]; ibans?: string[]; entityId?: string };
/** One of our own legal entities (finance_entities) as the intake recognises it. */
export type EntityIdentity = PsaIdentity & { entityId: string; entityName: string };

const ibanKey = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Identity of one entity: its own company settings row (pm_invoice_settings,
 * project_id null) — name, NIF, name variants — plus the IBANs of THAT
 * entity's bank accounts only.
 */
export async function loadEntityIdentity(entityId: string): Promise<EntityIdentity> {
  const [{ data: ent }, { data: set }, { data: accts }] = await Promise.all([
    supabaseAdmin.from("finance_entities").select("id, name, nif").eq("id", entityId).maybeSingle(),
    supabaseAdmin.from("pm_invoice_settings")
      .select("company_nif, company_name, company_name_variants")
      .eq("entity_id", entityId).is("project_id", null).limit(1).maybeSingle(),
    supabaseAdmin.from("bank_accounts").select("iban").eq("entity_id", entityId).not("iban", "is", null),
  ]);
  return {
    entityId,
    entityName: ent?.name ?? "",
    vat: set?.company_nif ?? null,
    name: set?.company_name ?? null,
    variants: (set?.company_name_variants as string[] | null) ?? [],
    ibans: (accts ?? []).map((r) => ibanKey(r.iban)).filter((v) => v.length >= 15),
  };
}

/** Every active entity's identity (PSA first). Entities without a settings row are skipped. */
export async function loadActiveIdentities(): Promise<EntityIdentity[]> {
  const { data } = await supabaseAdmin.from("finance_entities").select("id").eq("active", true);
  const ids = (data ?? []).map((e) => e.id).sort((a, b) => (a === PSA_ENTITY_ID ? -1 : b === PSA_ENTITY_ID ? 1 : 0));
  const all = await Promise.all(ids.map(loadEntityIdentity));
  return all.filter((i) => i.vat || i.name || i.variants.length || (i.ibans ?? []).length);
}

export type Party = { name: string | null; vat: string | null; iban: string | null };

/** A payer/beneficiary side is PSA by NIF, name variant or a PSA account IBAN. */
export function isPsaParty(p: Party, psa: PsaIdentity): boolean {
  if (p.vat && psa.vat && sameVat(p.vat, psa.vat)) return true;
  if (p.iban && (psa.ibans ?? []).includes(ibanKey(p.iban))) return true;
  return isPsaName(p.name, psa);
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
  // PSA's own mailbox printed as the addressee (PSA's identity only).
  if ((!psa.entityId || psa.entityId === PSA_ENTITY_ID) && /@pedrasilva\.com\b/i.test(String(name))) return true;
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
  /** Payer + beneficiary of a payment proof / transfer confirmation. */
  parties?: Party[];
}): RecipientDecision {
  if (o.keep || o.forcedType) return { kind: "psa" };
  if (o.type === "nao_financeiro") return { kind: "skip" };
  if (o.type === "comprovativo_pagamento") {
    // PSA's if EITHER side is PSA; removed only when neither is and one side is clearly another entity.
    const sides: Party[] = [...(o.parties ?? []), { name: o.name, vat: o.vat, iban: null }];
    if (sides.some((p) => isPsaParty(p, o.psa))) return { kind: "psa" };
    if (o.verify) return { kind: "triage" };
    const other = sides.find((p) => p.vat || (p.name && !NO_NAME.test(norm(p.name)) && !ADDRESS_ONLY.test(norm(p.name))));
    const sidesKnown = (o.parties ?? []).some((p) => p.name || p.vat || p.iban);
    if (other && sidesKnown) return { kind: "remove", reason: removalReason(other.name?.trim() ?? null, other.vat) };
    return { kind: "triage" };
  }
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

export type EntityRoute =
  | { kind: "entity"; entityId: string; decision: RecipientDecision }
  | { kind: "none"; entityId: string; decision: RecipientDecision }
  | { kind: "both"; entityId: string; entityIds: string[] };

/**
 * Multi-entity routing: the recipient / payer-beneficiary rule run against
 * EVERY active entity. Exactly one match → that entity; none → PSA's decision
 * (Eliminados / Triagem as before); several → PSA's Triagem, flagged.
 * `direction` is computed per entity (the caller passes a function).
 */
export function routeEntity(
  identities: EntityIdentity[],
  base: Omit<Parameters<typeof decideRecipient>[0], "psa" | "direction">,
  directionFor: (id: EntityIdentity) => string,
  issuerMatches: (id: EntityIdentity) => boolean,
): EntityRoute {
  const psa = identities.find((i) => i.entityId === PSA_ENTITY_ID) ?? identities[0];
  const psaId = psa?.entityId ?? PSA_ENTITY_ID;
  if (!psa) return { kind: "none", entityId: psaId, decision: { kind: "triage" } };
  const hits = identities.filter((id) => {
    const dir = directionFor(id);
    // An issued document is ours only when the issuer is that entity.
    if (dir === "issued" || base.type === "fatura_emitida") return issuerMatches(id);
    return decideRecipient({ ...base, keep: false, forcedType: null, psa: id, direction: dir }).kind === "psa";
  });
  if (hits.length === 1) return { kind: "entity", entityId: hits[0].entityId, decision: decideRecipient({ ...base, psa: hits[0], direction: directionFor(hits[0]) }) };
  if (hits.length > 1) return { kind: "both", entityId: psaId, entityIds: hits.map((h) => h.entityId) };
  return { kind: "none", entityId: psaId, decision: decideRecipient({ ...base, psa, direction: directionFor(psa) }) };
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

export async function loadRemovalRules(entityId: string): Promise<RemovalRule[]> {
  const { data } = await supabaseAdmin
    .from("finance_intake_instructions")
    .select("id, text, scope_type, scope_value")
    .eq("entity_id", entityId)
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
    .eq("purge_exempt", false)
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
