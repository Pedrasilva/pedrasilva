/**
 * Finance intake inbox actions. Every action is a person's explicit choice;
 * nothing is auto-approved. All writes are scoped to pending queue items.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { currentEntityId } from "@/lib/finance/current-entity";

const TYPES = [
  "fatura_compra", "nota_credito", "recibo", "comprovativo_pagamento", "extrato_bancario",
  "nota_lancamento", "fatura_emitida", "documento_fiscal", "contrato_outro", "nao_financeiro", "desconhecido",
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertFinanceAccess(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_permission", { _user_id: userId, _key: "finance.dashboard" }),
  ]);
  if (!isAdmin && !hasFinance) throw new Response("Forbidden: finance access required", { status: 403 });
}

async function loadPending(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("financial_document_review_queue")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (data.status !== "pending_review") throw new Error(`Item is already ${data.status}`);
  if (Array.isArray(data.possible_duplicates) && data.possible_duplicates.length > 0 && !data.possible_duplicate_resolved) {
    throw new Error("Possible duplicate: choose \"É duplicado\" or \"Não é duplicado\" first");
  }
  return data;
}

const nifOf = (v: string | null | undefined) =>
  (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PT/, "").toLowerCase() || null;

/** "Reclassificar" / Triagem buttons: set the type and re-run extraction for it. */
export const reclassifyQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), type: z.enum(TYPES) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinanceAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("financial_document_review_queue")
      .select("status, intake_type, model_runs, applied_learning, extracted_supplier_vat")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.status !== "pending_review") throw new Error(`Item is already ${row.status}`);
    // Learning: record the person's type correction (no document contents).
    const aiType =
      (row.applied_learning as { ai_type?: string | null } | null)?.ai_type ??
      (row.model_runs as { claude?: { intake_type?: string | null } } | null)?.claude?.intake_type ??
      row.intake_type ?? null;
    if (aiType !== data.type) {
      await context.supabase.from("finance_intake_corrections").insert({ entity_id: await currentEntityId(context.supabase), 
        queue_item_id: data.id, supplier_nif: nifOf(row.extracted_supplier_vat), field: "intake_type",
        ai_value: aiType, corrected_value: data.type, corrected_by: context.userId,
      });
    }
    const { reprocessQueueItem } = await import("@/lib/finance/doc-intake.server");
    return reprocessQueueItem(data.id, { forcedType: data.type });
  });

/** Payment matching: record the payment on the chosen purchase. Never creates a purchase. */
export const confirmPaymentMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      documentId: z.string().uuid(),
      amount: z.number().positive(),
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const row = await loadPending(supabase, data.id);
    if (row.intake_route !== "payments") throw new Error("Not a payment document");

    const { data: doc, error: docErr } = await supabase
      .from("financial_documents")
      .select("id, direction, status")
      .eq("id", data.documentId)
      .single();
    if (docErr) throw new Error(docErr.message);
    if (doc.direction !== "received" || doc.status === "cancelled") throw new Error("Not an open purchase");

    const pm = row.extracted_payment_method as string | null;
    const method = (["bank_transfer", "cash", "card", "direct_debit"].includes(pm ?? "") ? pm : "other") as
      "bank_transfer" | "cash" | "card" | "direct_debit" | "other";
    const { data: pay, error: payErr } = await supabase
      .from("financial_document_payments")
      .insert({
        document_id: data.documentId,
        amount: data.amount,
        payment_date: data.paymentDate,
        method,
        notes: `Comprovativo ${row.original_filename ?? ""}`.trim(),
        created_by: userId,
      })
      .select("id")
      .single();
    if (payErr) throw new Error(payErr.message);

    const { error } = await supabase
      .from("financial_document_review_queue")
      .update({
        status: "paid",
        settled_document_id: data.documentId,
        settled_payment_id: pay.id,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bank documents: file under an account + month, then copy to the accountant's Drive. */
export const fileBankDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      bankAccountId: z.string().uuid(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const row = await loadPending(supabase, data.id);
    if (row.intake_route !== "bank") throw new Error("Not a bank document");
    const { data: acct, error: aErr } = await supabase
      .from("bank_accounts")
      .select("id, account_name, bank_name")
      .eq("id", data.bankAccountId)
      .single();
    if (aErr) throw new Error(aErr.message);

    const { error } = await supabase
      .from("financial_document_review_queue")
      .update({
        status: "filed",
        matched_bank_account_id: data.bankAccountId,
        bank_period: data.period,
        filed_at: new Date().toISOString(),
        drive_copy_status: "pending",
        drive_copy_attempts: 0,
        drive_next_retry_at: new Date().toISOString(),
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    // The Hub copy is filed either way; a failed Drive copy retries automatically.
    const { copyQueueItemToDrive } = await import("@/lib/finance/bank-drive-filing.server");
    const r = await copyQueueItemToDrive(data.id);
    return { ok: true, driveCopied: r.ok, driveError: r.ok ? null : r.error ?? null };
  });

/** Retry only the Drive copy of an already filed bank document. */
export const retryBankDriveCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { copyQueueItemToDrive } = await import("@/lib/finance/bank-drive-filing.server");
    const r = await copyQueueItemToDrive(data.id, { manual: true });
    return { ok: r.ok, driveCopied: r.ok, driveError: r.ok ? null : r.error ?? null };
  });

/** "Outros documentos": mark as filed manually. */
export const markOtherDocumentFiled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const row = await loadPending(supabase, data.id);
    if (row.intake_route !== "other") throw new Error("Not an 'other' document");
    const { error } = await supabase
      .from("financial_document_review_queue")
      .update({ status: "filed", filed_at: new Date().toISOString(), reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

const ordered = (x: string, y: string) => (x < y ? { item_a: x, item_b: y } : { item_a: y, item_b: x });

/** "Possível duplicado": a person decides; the decision is remembered for each pair. */
export const resolvePossibleDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["duplicate", "not_duplicate"]),
      /** The candidate it duplicates (queue item or live document). */
      otherId: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: row, error } = await supabase
      .from("financial_document_review_queue")
      .select("id, status, possible_duplicates")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.status !== "pending_review") throw new Error(`Item is already ${row.status}`);
    const cands = (row.possible_duplicates ?? []) as Array<{ queueItemId?: string; documentId?: string; reason: string }>;
    const ids = cands.map((c) => c.queueItemId ?? c.documentId).filter(Boolean) as string[];
    if (data.decision === "duplicate") {
      const other = cands.find((c) => (c.queueItemId ?? c.documentId) === data.otherId) ?? cands[0];
      if (!other) throw new Error("No candidate to link");
      const otherId = (other.queueItemId ?? other.documentId)!;
      await supabase.from("finance_duplicate_decisions").upsert(
        { entity_id: await currentEntityId(supabase),  ...ordered(data.id, otherId), decision: "duplicate", decided_by: userId },
        { onConflict: "item_a,item_b" },
      );
      const { error: e2 } = await supabase
        .from("financial_document_review_queue")
        .update({
          status: "duplicate",
          duplicate_kind: "probable",
          duplicate_reason: other.reason,
          duplicate_of_id: other.queueItemId ?? null,
          duplicate_of_document_id: other.documentId ?? null,
          possible_duplicate_resolved: true,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (e2) throw new Error(e2.message);
    } else {
      if (ids.length) {
        await supabase.from("finance_duplicate_decisions").upsert(
          ids.map((o) => ({ entity_id: await currentEntityId(supabase),  ...ordered(data.id, o), decision: "not_duplicate", decided_by: userId })),
          { onConflict: "item_a,item_b" },
        );
      }
      const { error: e2 } = await supabase
        .from("financial_document_review_queue")
        .update({ possible_duplicate_resolved: true })
        .eq("id", data.id);
      if (e2) throw new Error(e2.message);
    }
    return { ok: true };
  });

/**
 * "Não é duplicado" / "Guardar mesmo assim" on a duplicate: back to review.
 * A same-file duplicate was never read, so it is read now.
 */
export const restoreDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: row, error } = await supabase
      .from("financial_document_review_queue")
      .select("id, status, duplicate_kind, duplicate_of_id, duplicate_of_document_id")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.status !== "duplicate") throw new Error("Not a duplicate");
    const other = row.duplicate_of_id ?? row.duplicate_of_document_id;
    if (other) {
      await supabase.from("finance_duplicate_decisions").upsert(
        { entity_id: await currentEntityId(supabase),  ...ordered(data.id, other), decision: "not_duplicate", decided_by: userId },
        { onConflict: "item_a,item_b" },
      );
    }
    const { error: e2 } = await supabase
      .from("financial_document_review_queue")
      .update({
        status: "pending_review",
        duplicate_kind: null,
        duplicate_reason: null,
        duplicate_of_id: null,
        duplicate_of_document_id: null,
        possible_duplicate_resolved: true,
      })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);
    if (row.duplicate_kind === "file") {
      const { reprocessQueueItem } = await import("@/lib/finance/doc-intake.server");
      return reprocessQueueItem(data.id);
    }
    return { ok: true };
  });

/** Manual purchase entry: warn before saving a document that already exists (checks b and c). */
export const checkManualDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      supplierId: z.string().uuid(),
      documentNumber: z.string().max(120).nullable(),
      issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      total: z.number().nullable(),
      excludeDocumentId: z.string().uuid().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: co } = await supabase.from("companies").select("nif, nome").eq("id", data.supplierId).maybeSingle();
    if (!co?.nif) return { matches: [] };
    const { checkDocumentDuplicates } = await import("@/lib/finance/intake-duplicates.server");
    const res = await checkDocumentDuplicates({
      selfId: data.excludeDocumentId ?? null,
      intakeType: "fatura_compra",
      direction: "received",
      nif: co.nif,
      supplierName: co.nome,
      documentNumber: data.documentNumber,
      date: data.issueDate,
      total: data.total,
      bankAccountId: null, iban: null, accountNumber: null, periodStart: null, periodEnd: null,
    });
    const all = [...(res.exact ? [res.exact] : []), ...res.probable]
      .filter((m) => !data.excludeDocumentId || m.documentId !== data.excludeDocumentId);
    return { matches: all.map((m) => ({ ...m, supplier: co.nome })) };
  });

// ---------------------------------------------------------------------------
// Learning: "Explicar" box
// ---------------------------------------------------------------------------

const SCOPES = ["document", "recipient", "supplier", "sender", "global"] as const;
const SCOPE_TYPE = {
  document: "document", recipient: "recipient_nif", supplier: "supplier_nif", sender: "sender", global: "global",
} as const;

function senderMatches(scope: string, sender: string | null) {
  if (!sender) return false;
  const email = sender.toLowerCase();
  if (scope.includes("@")) return scope === email;
  const domain = email.split("@")[1] ?? "";
  return domain === scope || domain.endsWith(`.${scope}`);
}

/**
 * "Guardar nota": store the note on the document and, for the chosen scope,
 * as an instruction. The same note with the same scope is never saved twice.
 */
export const saveExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      note: z.string().trim().min(1).max(1000),
      scope: z.enum(SCOPES),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: row, error } = await supabase
      .from("financial_document_review_queue")
      .select("id, extracted_supplier_vat, extracted_seller_vat, extracted_recipient_vat, extracted_buyer_vat, sender_address")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("financial_document_review_queue").update({ review_note: data.note }).eq("id", data.id);
    const value =
      data.scope === "document" ? data.id.toLowerCase()
      : data.scope === "recipient" ? nifOf(row.extracted_recipient_vat ?? row.extracted_buyer_vat)
      : data.scope === "supplier" ? nifOf(row.extracted_supplier_vat ?? row.extracted_seller_vat)
      : data.scope === "sender" ? row.sender_address?.toLowerCase().trim() ?? null
      : null;
    if (data.scope !== "global" && !value) throw new Error(`No ${data.scope} on this document`);
    const scopeType = SCOPE_TYPE[data.scope];
    let q = supabase
      .from("finance_intake_instructions")
      .select("id, text, scope_type, scope_value")
      .eq("active", true)
      .eq("scope_type", scopeType)
      .eq("text", data.note);
    q = value ? q.eq("scope_value", value) : q.is("scope_value", null);
    const { data: existing } = await q.limit(1).maybeSingle();
    if (existing) return { ok: true, instruction: existing, reused: true };
    const { data: ins, error: e2 } = await supabase
      .from("finance_intake_instructions")
      .insert({ entity_id: await currentEntityId(supabase),  text: data.note, scope_type: scopeType, scope_value: value, created_by: userId })
      .select("id, text, scope_type, scope_value")
      .single();
    if (e2) throw new Error(e2.message);
    return { ok: true, instruction: ins, reused: false };
  });

type ItemSummary = {
  id: string; status: string; intake_type: string | null; intake_route: string | null;
  title: string; date: string | null;
};

async function summarise(supabase: any, ids: string[]): Promise<ItemSummary[]> {
  if (!ids.length) return [];
  const { data } = await supabase
    .from("financial_document_review_queue")
    .select("id, status, intake_type, intake_route, extracted_seller_name, extracted_supplier_name, original_filename, extracted_date")
    .in("id", ids);
  return (data ?? []).map((r: any) => ({
    id: r.id, status: r.status, intake_type: r.intake_type, intake_route: r.intake_route,
    title: r.extracted_seller_name ?? r.extracted_supplier_name ?? r.original_filename ?? "—",
    date: r.extracted_date,
  }));
}

/** Re-read pending documents now (the current rules apply). At most 3 per call. */
export const rereadItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(3) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinanceAccess(context.supabase, context.userId);
    const { reprocessQueueItem } = await import("@/lib/finance/doc-intake.server");
    const errors: Array<{ id: string; error: string }> = [];
    for (const id of data.ids) {
      const r = await reprocessQueueItem(id);
      if (!r.ok) errors.push({ id, error: r.error ?? "failed" });
    }
    return { items: await summarise(context.supabase, data.ids), errors };
  });

/** Pending documents a saved instruction would apply to (preview only). */
export const findRuleMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ instructionId: z.string().uuid(), excludeId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: ins, error } = await supabase
      .from("finance_intake_instructions")
      .select("id, scope_type, scope_value")
      .eq("id", data.instructionId)
      .single();
    if (error) throw new Error(error.message);
    if (ins.scope_type === "document") return { items: [] as ItemSummary[] };
    const { data: rows, error: e2 } = await supabase
      .from("financial_document_review_queue")
      .select("id, status, intake_type, intake_route, intake_type_source, extracted_seller_name, extracted_supplier_name, original_filename, extracted_date, extracted_recipient_vat, extracted_buyer_vat, extracted_supplier_vat, extracted_seller_vat, sender_address")
      .eq("status", "pending_review")
      .neq("id", data.excludeId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (e2) throw new Error(e2.message);
    const v = ins.scope_value ?? "";
    const hit = (r: any) =>
      ins.scope_type === "global" ? true
      : ins.scope_type === "recipient_nif" ? nifOf(r.extracted_recipient_vat ?? r.extracted_buyer_vat) === v
      : ins.scope_type === "supplier_nif" ? nifOf(r.extracted_supplier_vat ?? r.extracted_seller_vat) === v
      : ins.scope_type === "sender" ? senderMatches(v, r.sender_address)
      : false;
    const items = (rows ?? []).filter(hit).map((r: any) => ({
      id: r.id, status: r.status, intake_type: r.intake_type, intake_route: r.intake_route,
      title: r.extracted_seller_name ?? r.extracted_supplier_name ?? r.original_filename ?? "—",
      date: r.extracted_date, manualType: r.intake_type_source === "manual",
    }));
    return { items };
  });

const REMOVE_TAGS = ["not_psa", "duplicate", "not_financial", "test", "other"] as const;
const REMOVE_SCOPES = ["none", "recipient", "supplier", "sender", "sender_domain"] as const;

/**
 * "Eliminar": a required reason. The item moves to Eliminados (restorable for
 * 30 days), the reason is recorded as a correction and, with a scope, saved as
 * a deletion rule (instruction with action "remove").
 */
export const removeQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      reason: z.string().trim().min(1).max(1000),
      tag: z.enum(REMOVE_TAGS),
      scope: z.enum(REMOVE_SCOPES).default("none"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: row, error } = await supabase
      .from("financial_document_review_queue")
      .select("id, status, intake_type, extracted_supplier_vat, extracted_seller_vat, extracted_recipient_vat, extracted_buyer_vat, sender_address")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.status === "approved" || row.status === "removed") throw new Error(`Item is already ${row.status}`);
    const { removeColumns } = await import("@/lib/finance/recipient-rule.server");
    const { error: e1 } = await supabase
      .from("financial_document_review_queue")
      .update({ ...removeColumns({ reason: data.reason, source: "manual", tag: data.tag, by: userId, prevStatus: row.status }) })
      .eq("id", data.id);
    if (e1) throw new Error(e1.message);
    const supplierNif = nifOf(row.extracted_supplier_vat ?? row.extracted_seller_vat);
    await supabase.from("finance_intake_corrections").insert({ entity_id: await currentEntityId(supabase), 
      queue_item_id: data.id, supplier_nif: supplierNif, field: "removal",
      ai_value: row.intake_type, corrected_value: `${data.tag}: ${data.reason}`.slice(0, 500), corrected_by: userId,
    });
    if (data.scope === "none") return { ok: true, instruction: null };
    const sender = row.sender_address?.toLowerCase().trim() ?? null;
    const value =
      data.scope === "recipient" ? nifOf(row.extracted_recipient_vat ?? row.extracted_buyer_vat)
      : data.scope === "supplier" ? supplierNif
      : data.scope === "sender" ? sender
      : sender?.split("@")[1] ?? null;
    if (!value) throw new Error(`No ${data.scope} on this document`);
    const scopeType = data.scope === "recipient" ? "recipient_nif" : data.scope === "supplier" ? "supplier_nif" : "sender";
    const { data: existing } = await supabase
      .from("finance_intake_instructions")
      .select("id, text, scope_type, scope_value, action")
      .eq("active", true).eq("action", "remove").eq("scope_type", scopeType).eq("scope_value", value)
      .limit(1).maybeSingle();
    if (existing) return { ok: true, instruction: existing };
    const { data: ins, error: e2 } = await supabase
      .from("finance_intake_instructions")
      .insert({ entity_id: await currentEntityId(supabase),  text: data.reason, scope_type: scopeType, scope_value: value, action: "remove", created_by: userId })
      .select("id, text, scope_type, scope_value, action")
      .single();
    if (e2) throw new Error(e2.message);
    return { ok: true, instruction: ins };
  });

/** Apply a deletion rule to the confirmed similar pending documents. */
export const applyRemovalRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ instructionId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: ins, error } = await supabase
      .from("finance_intake_instructions").select("id, text, action").eq("id", data.instructionId).single();
    if (error) throw new Error(error.message);
    if (ins.action !== "remove") throw new Error("Not a deletion rule");
    const { removeColumns } = await import("@/lib/finance/recipient-rule.server");
    const { data: done, error: e2 } = await supabase
      .from("financial_document_review_queue")
      .update({ ...removeColumns({ reason: ins.text, source: `rule:${ins.id}`, tag: "rule", by: userId }) })
      .in("id", data.ids)
      .eq("status", "pending_review")
      .select("id");
    if (e2) throw new Error(e2.message);
    return { removed: done?.length ?? 0 };
  });

/** "Restaurar": back to its previous status; the recipient rule won't remove it again. */
export const restoreRemovedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: row, error } = await supabase
      .from("financial_document_review_queue").select("id, status, removed_prev_status").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (row.status !== "removed") throw new Error("Item is not removed");
    const prev = ["pending_review", "filed", "paid"].includes(row.removed_prev_status ?? "") ? row.removed_prev_status : "pending_review";
    const { error: e2 } = await supabase
      .from("financial_document_review_queue")
      .update({
        status: prev as "pending_review" | "filed" | "paid", keep_despite_recipient: true, removed_at: null, removed_by: null,
        removed_source: null, removed_reason: null, removed_tag: null, removed_prev_status: null,
      })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
