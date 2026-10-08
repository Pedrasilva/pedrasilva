/**
 * Incoming payments (recebimentos): person-confirmed actions. Suggestions are
 * computed server-side (recebimentos.server.ts); nothing is marked paid,
 * reconciled or filed until "Confirmar".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertFinanceAccess(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_permission", { _user_id: userId, _key: "finance.dashboard" }),
  ]);
  if (!isAdmin && !hasFinance) throw new Response("Forbidden: finance access required", { status: 403 });
}

const targetSchema = z.object({ kind: z.enum(["pm_invoice", "schedule_item", "issued_document"]), id: z.string().uuid() });

/** Open invoices / schedule items of a client, for "Alterar". */
export const listClientOpenTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ companyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinanceAccess(context.supabase, context.userId);
    const { openTargetsForClient } = await import("@/lib/finance/recebimentos.server");
    const { currentEntityId } = await import("@/lib/finance/current-entity");
    return openTargetsForClient(data.companyId, await currentEntityId(context.supabase));
  });

/** "Alterar": change the client (manual match) and recompute suggestions. */
export const setRecebimentoClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), companyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertFinanceAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("finance_recebimentos")
      .update({ company_id: data.companyId, client_match_method: "manual", client_match_detail: null, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("status", "suggested");
    if (error) throw new Error(error.message);
    const { refreshSuggestions } = await import("@/lib/finance/recebimentos.server");
    await refreshSuggestions(data.id);
    return { ok: true };
  });

export const confirmRecebimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      companyId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      bankTransactionIds: z.array(z.string().uuid()).max(10),
      targets: z.array(targetSchema).max(10),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ibanKey } = await import("@/lib/finance/recebimentos.server");
    const { data: rec, error: rErr } = await supabaseAdmin.from("finance_recebimentos").select("*").eq("id", data.id).single();
    if (rErr) throw new Error(rErr.message);
    if (rec.status === "confirmed") throw new Error("Already confirmed");
    // The caller must be able to see this recebimento (entity access + current entity).
    const { data: visible } = await supabase.from("finance_recebimentos").select("id").eq("id", data.id).maybeSingle();
    if (!visible) throw new Error("Not allowed");
    const entityId = rec.entity_id as string;
    const now = new Date().toISOString();
    let remaining = Number(rec.amount);
    const projectIds = new Set<string>();

    const pmInv = data.targets.filter((t) => t.kind === "pm_invoice").map((t) => t.id);
    const sched = data.targets.filter((t) => t.kind === "schedule_item").map((t) => t.id);
    const docs = data.targets.filter((t) => t.kind === "issued_document").map((t) => t.id);

    // Refuse before writing anything if any linked item belongs to another entity (or doesn't exist).
    const foreign: string[] = [];
    const checkEntity = async (table: string, ids: string[], label: string) => {
      if (!ids.length) return;
      const { data: rows, error } = await (supabaseAdmin as any).from(table).select("id, entity_id").in("id", ids);
      if (error) throw new Error(error.message);
      const ok = new Set((rows ?? []).filter((r: any) => r.entity_id === entityId).map((r: any) => r.id));
      for (const id of ids) if (!ok.has(id)) foreign.push(`${label} ${id.slice(0, 8)}`);
    };
    await checkEntity("pm_invoices", pmInv, "invoice");
    await checkEntity("pm_payment_schedule_items", sched, "schedule item");
    await checkEntity("financial_documents", docs, "document");
    await checkEntity("bank_transactions", data.bankTransactionIds, "bank line");
    const { data: proofRows } = await supabaseAdmin.from("financial_document_review_queue").select("id, entity_id").eq("recebimento_id", data.id);
    for (const p of proofRows ?? []) if (p.entity_id !== entityId) foreign.push(`proof ${p.id.slice(0, 8)}`);
    if (foreign.length) throw new Error(`Refused: belongs to another entity (${foreign.join(", ")})`);

    if (pmInv.length) {
      const { data: rows } = await supabaseAdmin.from("pm_invoices").select("id, project_id, total").in("id", pmInv);
      rows?.forEach((r) => { if (r.project_id) projectIds.add(r.project_id); remaining -= Number(r.total ?? 0); });
      const { error } = await supabaseAdmin.from("pm_invoices").update({ status: "paid", paid_date: data.date }).in("id", pmInv);
      if (error) throw new Error(error.message);
    }
    if (sched.length) {
      const { data: rows } = await supabaseAdmin.from("pm_payment_schedule_items").select("id, project_id").in("id", sched);
      rows?.forEach((r) => r.project_id && projectIds.add(r.project_id));
      const { error } = await supabaseAdmin.from("pm_payment_schedule_items").update({ billing_status: "paid" }).in("id", sched);
      if (error) throw new Error(error.message);
    }
    for (const id of docs) {
      const { data: d } = await supabaseAdmin.from("financial_documents").select("id, project_id, outstanding_amount, total_inc_vat").eq("id", id).single();
      if (!d) continue;
      if (d.project_id) projectIds.add(d.project_id);
      const amt = Math.max(0, Math.min(Number(d.outstanding_amount ?? d.total_inc_vat ?? 0), docs.length === 1 && !pmInv.length && !sched.length ? Number(rec.amount) : Number(d.outstanding_amount ?? 0)));
      if (amt > 0) {
        const { error } = await supabaseAdmin.from("financial_document_payments").insert({
          document_id: id, amount: amt, payment_date: data.date, method: "bank_transfer",
          notes: `Recebimento ${rec.payer_name ?? ""}`.trim(), created_by: userId,
        });
        if (error) throw new Error(error.message);
      }
    }
    if (data.bankTransactionIds.length) {
      const { error } = await supabaseAdmin.from("bank_transactions")
        .update({ reconciled_at: now, reconciled_by: userId }).in("id", data.bankTransactionIds).is("reconciled_at", null);
      if (error) throw new Error(error.message);
    }

    // Proofs → Arquivado; bank notices also get their account month and a Drive copy.
    const { data: proofs } = await supabaseAdmin.from("financial_document_review_queue")
      .select("id, intake_type, matched_bank_account_id, extracted_date, status").eq("recebimento_id", data.id);
    const driveIds: string[] = [];
    for (const p of proofs ?? []) {
      if (p.status !== "pending_review") continue;
      const isBank = p.intake_type === "nota_lancamento" && p.matched_bank_account_id;
      const { error } = await supabaseAdmin.from("financial_document_review_queue").update({
        status: "filed", filed_at: now, reviewed_by: userId, reviewed_at: now,
        ...(isBank ? { bank_period: (p.extracted_date ?? data.date).slice(0, 7), drive_copy_status: "pending", drive_copy_attempts: 0, drive_next_retry_at: now } : {}),
      }).eq("id", p.id);
      if (error) throw new Error(error.message);
      if (isBank) driveIds.push(p.id);
    }

    // Learn the payer's IBAN for this client (never a PSA account).
    const iban = ibanKey(rec.payer_iban);
    if (iban.length >= 15) {
      const { data: own } = await supabaseAdmin.from("bank_accounts").select("iban");
      if (!(own ?? []).some((a) => ibanKey(a.iban) === iban)) {
        await supabaseAdmin.from("company_ibans").upsert({ company_id: data.companyId, iban, recebimento_id: data.id, created_by: userId }, { onConflict: "iban", ignoreDuplicates: true });
      }
    }

    const { error } = await supabaseAdmin.from("finance_recebimentos").update({
      status: "confirmed", company_id: data.companyId, received_date: data.date,
      client_match_method: rec.company_id === data.companyId ? rec.client_match_method : "manual",
      bank_transaction_ids: data.bankTransactionIds, pm_invoice_ids: pmInv, schedule_item_ids: sched,
      financial_document_ids: docs, project_ids: [...projectIds], confirmed_by: userId, confirmed_at: now, updated_at: now,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (driveIds.length) {
      const { copyQueueItemToDrive } = await import("@/lib/finance/bank-drive-filing.server");
      for (const id of driveIds) { try { await copyQueueItemToDrive(id); } catch { /* retried automatically */ } }
    }
    return { ok: true, unallocated: Math.round(remaining * 100) / 100 };
  });
