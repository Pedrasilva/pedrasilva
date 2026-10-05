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
  return data;
}

/** "Reclassificar" / Triagem buttons: set the type and re-run extraction for it. */
export const reclassifyQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), type: z.enum(TYPES) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinanceAccess(context.supabase, context.userId);
    await loadPending(context.supabase, data.id);
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
    const method = ["bank_transfer", "cash", "card", "direct_debit"].includes(pm ?? "") ? pm : "other";
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
        status: "approved",
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
        status: "approved",
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
      .update({ status: "approved", filed_at: new Date().toISOString(), reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
