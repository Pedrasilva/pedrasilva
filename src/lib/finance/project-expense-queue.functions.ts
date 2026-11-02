/**
 * Project expense receipt → Finance review queue.
 *
 * Same shared pipeline as HR receipts (the file stays in `benefit-receipts`),
 * but the category is always PRJ.EXP "Despesas de projeto": anything entered
 * through Projects is a project pass-through cost, whatever it was spent on.
 * The trigger fdrq_guard_origin_classification keeps it inside PRJ.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";

export type RouteProjectExpenseReceiptResult = {
  ok: boolean;
  queueItemId?: string;
  skipped?: "no_receipt" | "already_queued";
  error?: string;
  extracted?: { supplier: string | null; documentNumber: string | null; date: string | null; currency: string | null; amount: number | null };
};

export const routeProjectExpenseReceiptToQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ expenseId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RouteProjectExpenseReceiptResult> => {
    const { supabase, userId } = context;

    // RLS decides visibility; an invisible row yields no record.
    const { data: expense, error: readErr } = await supabase
      .from("pm_expenses")
      .select("id, receipt_path, project_id, workflow_version, submitted_by, entity_id")
      .eq("id", data.expenseId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!expense) return { ok: false, error: "expense not found" };
    if (!expense.receipt_path) return { ok: true, skipped: "no_receipt" };
    if (expense.workflow_version === 2 && expense.submitted_by !== userId) {
      const { data: canFinance } = await supabase.rpc('pe_finance_access', { _entity: expense.entity_id ?? PSA_ENTITY_ID });
      if (!canFinance) return { ok: false, error: 'Forbidden' };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("financial_document_review_queue")
      .select("id")
      .eq("source_project_expense_id", expense.id)
      .neq("status", "rejected")
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: true, queueItemId: existing.id, skipped: "already_queued" };

    const { data: cls } = await supabaseAdmin
      .from("financial_classifications")
      .select("id")
      .eq("code", "PRJ.EXP")
      .eq("entity_id", PSA_ENTITY_ID)
      .maybeSingle();
    if (!cls) return { ok: false, error: "PRJ.EXP category missing" };

    const { ingestStoredDocument } = await import("@/lib/finance/doc-intake.server");
    const res = await ingestStoredDocument({
      bucket: "benefit-receipts",
      storagePath: expense.receipt_path,
      originalFilename: expense.receipt_path.split("/").pop() ?? null,
      source: "project_expense",
      createdBy: userId,
      forcedClassificationId: cls.id,
      extraFields: {
        source_project_expense_id: expense.id,
        created_project_id: expense.project_id,
      },
    });

    const { data: queue } = res.queueItemId ? await supabaseAdmin.from('financial_document_review_queue').select('extracted_supplier_name,extracted_document_number,extracted_date,extracted_currency,extracted_amount').eq('id', res.queueItemId).eq('entity_id', expense.entity_id ?? PSA_ENTITY_ID).maybeSingle() : { data: null };
    return { ok: res.ok, queueItemId: res.queueItemId, error: res.error, extracted: queue ? { supplier: queue.extracted_supplier_name, documentNumber: queue.extracted_document_number, date: queue.extracted_date, currency: queue.extracted_currency, amount: queue.extracted_amount } : undefined };
  });
