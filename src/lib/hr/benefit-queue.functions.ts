/**
 * HR benefit receipt → Finance review queue.
 *
 * The receipt file itself is NOT copied: the queue row points at the very same
 * object in the `benefit-receipts` bucket. Extraction, supplier matching,
 * grouping and recurring detection are the shared Finance pipeline, so an HR
 * expense arrives in Payments → Review queue pre-filled with supplier, VAT
 * numbers and amounts. Accounting only adds the classification code.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RouteBenefitReceiptResult = {
  ok: boolean;
  queueItemId?: string;
  skipped?: "no_receipt" | "already_queued";
  error?: string;
};

export const routeBenefitReceiptToQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ expenseId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RouteBenefitReceiptResult> => {
    const { supabase, userId } = context;

    // RLS decides visibility: the submitter sees their own expense, approvers
    // see all. An invisible row simply yields no record.
    const { data: expense, error: readErr } = await supabase
      .from("benefit_expenses")
      .select("id, foto_path, collaborator_id")
      .eq("id", data.expenseId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!expense) return { ok: false, error: "expense not found" };
    if (!expense.foto_path) return { ok: true, skipped: "no_receipt" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("financial_document_review_queue")
      .select("id")
      .eq("source_benefit_expense_id", expense.id)
      .neq("status", "rejected")
      .maybeSingle();
    if (existing) return { ok: true, queueItemId: existing.id, skipped: "already_queued" };

    const { ingestStoredDocument } = await import("@/lib/finance/doc-intake.server");
    const res = await ingestStoredDocument({
      bucket: "benefit-receipts",
      storagePath: expense.foto_path,
      originalFilename: expense.foto_path.split("/").pop() ?? null,
      source: "hr_benefit",
      createdBy: userId,
      extraFields: {
        source_benefit_expense_id: expense.id,
        assigned_collaborator_id: expense.collaborator_id,
      },
    });

    return { ok: res.ok, queueItemId: res.queueItemId, error: res.error };
  });
