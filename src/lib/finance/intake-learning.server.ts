/**
 * Finance intake learning (server-only): studio instructions, supplier
 * defaults and recent human corrections, turned into prompt text for the
 * readers. Instructions are written by people and beat the model's own
 * judgement; defaults pre-fill type and code ("Padrão do fornecedor").
 * No document contents are stored here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";
import { normalizeVat } from "@/lib/finance/doc-intake.server";

export const nifKey = (v: string | null | undefined) => normalizeVat(v)?.replace(/^PT/, "")?.toLowerCase() ?? null;

export type Instruction = { id: string; text: string; scope_type: "global" | "supplier_nif" | "sender" | "recipient_nif" | "document"; scope_value: string | null };
export type SupplierDefault = { intake_type: string; classification_code: string; based_on: string[] };
export type Correction = { field: string; ai_value: string | null; corrected_value: string | null };

export type Learning = {
  /** Applies whatever the supplier turns out to be (global + sender). */
  instructions: Instruction[];
  /** Supplier-scoped instructions, keyed by NIF (applied once the NIF is read). */
  supplierInstructions: Instruction[];
  /** Recipient-scoped instructions (applied when the addressee NIF matches). */
  recipientInstructions: Instruction[];
  defaults: SupplierDefault | null;
  examples: Correction[];
  nif: string | null;
};

function senderMatches(scope: string, sender: string | null) {
  if (!sender) return false;
  const email = sender.toLowerCase();
  if (scope.includes("@")) return scope === email;
  const domain = email.split("@")[1] ?? "";
  return domain === scope || domain.endsWith(`.${scope}`);
}

export async function supplierDefaults(nif: string | null, entityId: string = PSA_ENTITY_ID): Promise<SupplierDefault | null> {
  const n = nifKey(nif);
  if (!n) return null;
  const { data } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("id, intake_type, suggested_classification_code, extracted_supplier_vat, reviewed_at")
    .eq("entity_id", entityId)
    .eq("status", "approved")
    .not("intake_type", "is", null)
    .not("suggested_classification_code", "is", null)
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(500);
  const mine = (data ?? []).filter((r) => nifKey(r.extracted_supplier_vat) === n).slice(0, 2);
  if (mine.length < 2) return null;
  const [a, b] = mine;
  if (a.intake_type !== b.intake_type || a.suggested_classification_code !== b.suggested_classification_code) return null;
  return { intake_type: a.intake_type!, classification_code: a.suggested_classification_code!, based_on: mine.map((r) => r.id) };
}

async function recentCorrections(nif: string | null, entityId: string = PSA_ENTITY_ID): Promise<Correction[]> {
  const n = nifKey(nif);
  if (!n) return [];
  const { data } = await supabaseAdmin
    .from("finance_intake_corrections")
    .select("field, ai_value, corrected_value")
    .eq("entity_id", entityId)
    .eq("supplier_nif", n)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as Correction[];
}

/** Best guess of the supplier before reading: the NIF last seen from this sender. */
export async function nifHintForSender(sender: string | null, entityId: string = PSA_ENTITY_ID): Promise<string | null> {
  if (!sender) return null;
  const { data } = await supabaseAdmin
    .from("financial_document_review_queue")
    .select("extracted_supplier_vat")
    .eq("entity_id", entityId)
    .eq("sender_address", sender.toLowerCase())
    .not("extracted_supplier_vat", "is", null)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(5);
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const k = nifKey(r.extracted_supplier_vat);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

export async function loadLearning(opts: { nif: string | null; sender: string | null; docId?: string | null; entityId?: string }): Promise<Learning> {
  const entityId = opts.entityId ?? PSA_ENTITY_ID;
  const { data } = await supabaseAdmin
    .from("finance_intake_instructions")
    .select("id, text, scope_type, scope_value")
    .eq("entity_id", entityId)
    .eq("active", true)
    .eq("action", "note")
    .order("created_at", { ascending: true });
  const all = (data ?? []) as Instruction[];
  const nif = nifKey(opts.nif);
  const [defaults, examples] = await Promise.all([supplierDefaults(nif, entityId), recentCorrections(nif, entityId)]);
  return {
    instructions: all.filter(
      (i) =>
        i.scope_type === "global" ||
        (i.scope_type === "sender" && senderMatches(i.scope_value ?? "", opts.sender)) ||
        (i.scope_type === "document" && !!opts.docId && i.scope_value === opts.docId.toLowerCase()),
    ),
    supplierInstructions: all.filter((i) => i.scope_type === "supplier_nif"),
    recipientInstructions: all.filter((i) => i.scope_type === "recipient_nif"),
    defaults,
    examples,
    nif,
  };
}

/** Prompt section "Regras do estúdio" (instructions win over the model). */
export function learningPrompt(l: Learning): string {
  const lines: string[] = [];
  for (const i of l.instructions) lines.push(`- ${i.text}`);
  for (const i of l.supplierInstructions) lines.push(`- If the supplier/seller NIF is ${i.scope_value}: ${i.text}`);
  for (const i of l.recipientInstructions) lines.push(`- If the recipient/addressee (customer, account holder) NIF is ${i.scope_value}: ${i.text}`);
  let out = "";
  if (lines.length) {
    out += `\n\nREGRAS DO ESTÚDIO (studio rules written by the finance team). They OVERRIDE your own judgement on type and classification whenever they apply:\n${lines.join("\n")}`;
  }
  if (l.defaults) {
    out += `\n\nSUPPLIER PATTERN for NIF ${l.nif}: the last approved documents from this supplier were intake_type "${l.defaults.intake_type}" with classification_code "${l.defaults.classification_code}". Use these as the expected answer unless the document clearly says otherwise.`;
  }
  if (l.examples.length) {
    out += `\n\nRECENT CORRECTIONS by a person for NIF ${l.nif} (learn from them):\n${l.examples
      .map((e) => `- ${e.field}: the reader said "${e.ai_value ?? "—"}", the correct value was "${e.corrected_value ?? "—"}"`)
      .join("\n")}`;
  }
  return out;
}

/** What was actually applied to a document, for display and rule links. */
export function appliedLearning(
  l: Learning,
  readNif: string | null,
  extra: { defaultsPrefilled: boolean; aiType: string | null; aiCode: string | null; recipientNif?: string | null },
) {
  const n = nifKey(readNif);
  const rn = nifKey(extra.recipientNif ?? null);
  return {
    instructions: [
      ...l.instructions.map((i) => ({ id: i.id, text: i.text, scope_type: i.scope_type, scope_value: i.scope_value })),
      ...l.supplierInstructions
        .filter((i) => n && i.scope_value === n)
        .map((i) => ({ id: i.id, text: i.text, scope_type: i.scope_type, scope_value: i.scope_value })),
      ...l.recipientInstructions
        .filter((i) => rn && i.scope_value === rn)
        .map((i) => ({ id: i.id, text: i.text, scope_type: i.scope_type, scope_value: i.scope_value })),
    ],
    defaults: l.defaults ? { ...l.defaults, prefilled: extra.defaultsPrefilled } : null,
    examples: l.examples.length,
    ai_type: extra.aiType,
    ai_code: extra.aiCode,
  };
}
