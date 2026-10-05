/**
 * Finance intake inbox actions. Every action is a person's explicit choice;
 * nothing is auto-approved. All writes are scoped to pending queue items.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      await context.supabase.from("finance_intake_corrections").insert({
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

    let driveId: string | null = null;
    let driveErr: string | null = null;
    try {
      const { copyBankDocumentToDrive } = await import("@/lib/finance/bank-drive-filing.server");
      const ext = (row.source_file_url as string).split(".").pop() ?? "pdf";
      const kind = row.intake_type === "nota_lancamento" ? "nota-lancamento" : "extrato";
      driveId = await copyBankDocumentToDrive({
        bucket: row.source_bucket ?? "financial-documents",
        storagePath: row.source_file_url,
        filename: `${data.period}_${kind}_${(row.id as string).slice(0, 8)}.${ext}`,
        accountLabel: [acct.bank_name, acct.account_name].filter(Boolean).join(" "),
        period: data.period,
      });
    } catch (e) {
      driveErr = e instanceof Error ? e.message : String(e);
    }

    const { error } = await supabase
      .from("financial_document_review_queue")
      .update({
        status: "filed",
        matched_bank_account_id: data.bankAccountId,
        bank_period: data.period,
        filed_at: new Date().toISOString(),
        drive_file_id: driveId,
        drive_copy_error: driveErr,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, driveCopied: !!driveId, driveError: driveErr };
  });

/** Retry only the Drive copy of an already filed bank document. */
export const retryBankDriveCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: row, error } = await supabase
      .from("financial_document_review_queue")
      .select("id, intake_type, source_bucket, source_file_url, matched_bank_account_id, bank_period, drive_file_id, filed_at")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (!row.filed_at || !row.matched_bank_account_id || !row.bank_period) throw new Error("Not filed yet");
    if (row.drive_file_id) return { ok: true, driveCopied: true };
    const { data: acct } = await supabase
      .from("bank_accounts").select("account_name, bank_name").eq("id", row.matched_bank_account_id).single();
    const { copyBankDocumentToDrive } = await import("@/lib/finance/bank-drive-filing.server");
    let driveId: string | null = null;
    let driveErr: string | null = null;
    try {
      const ext = (row.source_file_url as string).split(".").pop() ?? "pdf";
      driveId = await copyBankDocumentToDrive({
        bucket: row.source_bucket ?? "financial-documents",
        storagePath: row.source_file_url,
        filename: `${row.bank_period}_${row.intake_type === "nota_lancamento" ? "nota-lancamento" : "extrato"}_${row.id.slice(0, 8)}.${ext}`,
        accountLabel: [acct?.bank_name, acct?.account_name].filter(Boolean).join(" "),
        period: row.bank_period,
      });
    } catch (e) {
      driveErr = e instanceof Error ? e.message : String(e);
    }
    await supabase
      .from("financial_document_review_queue")
      .update({ drive_file_id: driveId, drive_copy_error: driveErr })
      .eq("id", data.id);
    return { ok: !!driveId, driveCopied: !!driveId, driveError: driveErr };
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
        { ...ordered(data.id, otherId), decision: "duplicate", decided_by: userId },
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
          ids.map((o) => ({ ...ordered(data.id, o), decision: "not_duplicate", decided_by: userId })),
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
        { ...ordered(data.id, other), decision: "not_duplicate", decided_by: userId },
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

export const saveExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      note: z.string().trim().min(1).max(1000),
      applyToSupplier: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { data: row, error } = await supabase
      .from("financial_document_review_queue")
      .select("id, extracted_supplier_vat, sender_address")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("financial_document_review_queue").update({ review_note: data.note }).eq("id", data.id);
    let instructionId: string | null = null;
    if (data.applyToSupplier) {
      const nif = nifOf(row.extracted_supplier_vat);
      const sender = row.sender_address?.toLowerCase() ?? null;
      if (!nif && !sender) throw new Error("No supplier NIF or sender on this document");
      const { data: ins, error: e2 } = await supabase
        .from("finance_intake_instructions")
        .insert({
          text: data.note,
          scope_type: nif ? "supplier_nif" : "sender",
          scope_value: nif ?? sender,
          created_by: userId,
        })
        .select("id")
        .single();
      if (e2) throw new Error(e2.message);
      instructionId = ins.id;
    }
    return { ok: true, instructionId };
  });
