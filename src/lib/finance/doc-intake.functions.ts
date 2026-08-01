/**
 * D3 — Document classification core (server functions).
 *
 * Every result lands in `financial_document_review_queue` with
 * `status = 'pending_review'`. NOTHING is written to live financial tables
 * until a human approves BOTH the supplier and the classification — this
 * holds even for recurring documents the system has seen before.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertFinanceAccess(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
) {
  const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_permission", { _user_id: userId, _key: "finance.dashboard" }),
  ]);
  if (!isAdmin && !hasFinance) {
    throw new Response("Forbidden: finance access required", { status: 403 });
  }
}

export type IngestResult = {
  ok: boolean;
  queueItemId?: string;
  groupId?: string;
  error?: string;
};

/** Upload → extract → match → queue. Never writes to live financial tables. */
export const ingestFinancialDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storagePath: z.string().min(1).max(1024),
        bucket: z.string().min(1).max(64).default("financial-documents"),
        originalFilename: z.string().max(512).nullable().optional(),
        source: z.enum(["manual_upload", "email_ingestion"]).default("manual_upload"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<IngestResult> => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      extractDocument,
      matchSupplierByVat,
      detectRecurring,
      resolveDocumentGroup,
      loadClassificationCatalog,
    } = await import("@/lib/finance/doc-intake.server");

    const result = await extractDocument(data.bucket, data.storagePath);

    if (!result.ok) {
      const { data: row, error } = await supabaseAdmin
        .from("financial_document_review_queue")
        .insert({
          source_file_url: data.storagePath,
          source_bucket: data.bucket,
          original_filename: data.originalFilename ?? null,
          source: data.source,
          extraction_error: result.error,
          created_by: userId,
        })
        .select("id, linked_document_group_id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: false, error: result.error, queueItemId: row.id, groupId: row.linked_document_group_id };
    }

    const ex = result.extraction;
    const catalog = await loadClassificationCatalog();
    const suggested = ex.classification_code
      ? catalog.find((c) => c.code.toLowerCase() === ex.classification_code!.trim().toLowerCase()) ?? null
      : null;

    const match = await matchSupplierByVat(ex.supplier_vat);
    const recurring = await detectRecurring(ex.supplier_vat, ex.total_amount);
    const groupId = await resolveDocumentGroup(ex.document_number, ex.supplier_vat);

    const insertPayload: Record<string, unknown> = {
      source_file_url: data.storagePath,
      source_bucket: data.bucket,
      original_filename: data.originalFilename ?? null,
      source: data.source,
      raw_extraction: result.raw as object,
      doc_type: ex.doc_type ?? "unknown",
      doc_type_confidence: ex.doc_type_confidence ?? null,
      extracted_amount: ex.total_amount,
      extracted_vat_amount: ex.vat_amount,
      extracted_date: ex.issue_date,
      extracted_due_date: ex.due_date,
      extracted_currency: ex.currency ?? "EUR",
      extracted_document_number: ex.document_number,
      extracted_supplier_name: ex.supplier_name,
      extracted_supplier_vat: ex.supplier_vat,
      supplier_match_status: match.status,
      matched_supplier_id: match.matched_supplier_id,
      ambiguous_supplier_ids: match.ambiguous_ids,
      // Recurring re-uses last approved classification, but still needs review.
      suggested_classification_id: recurring.classification_id ?? suggested?.id ?? null,
      suggested_classification_code: suggested?.code ?? ex.classification_code ?? null,
      classification_confidence: ex.classification_confidence ?? null,
      is_recurring_candidate: recurring.is_recurring_candidate,
      recurring_reference_id: recurring.reference_id,
      created_by: userId,
    };
    if (groupId) insertPayload.linked_document_group_id = groupId;

    const { data: row, error } = await supabaseAdmin
      .from("financial_document_review_queue")
      .insert(insertPayload)
      .select("id, linked_document_group_id")
      .single();
    if (error) return { ok: false, error: error.message };

    return { ok: true, queueItemId: row.id, groupId: row.linked_document_group_id };
  });

/**
 * Checkpoint 1 — approve the supplier. Optionally creates a new supplier
 * company from the reviewer-confirmed fields (never automatic).
 */
export const approveQueueSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        supplierId: z.string().uuid().nullable().optional(),
        newSupplier: z
          .object({
            nome: z.string().min(1).max(200),
            nif: z.string().max(40).nullable().optional(),
            email: z.string().max(200).nullable().optional(),
          })
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);

    let supplierId = data.supplierId ?? null;
    if (!supplierId && data.newSupplier) {
      const { data: created, error } = await supabase
        .from("companies")
        .insert({
          nome: data.newSupplier.nome,
          nif: data.newSupplier.nif ?? null,
          email: data.newSupplier.email ?? null,
          is_supplier: true,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      supplierId = created.id;
    }
    if (!supplierId) throw new Error("A supplier must be selected or created before approval");

    const { error: upErr } = await supabase
      .from("financial_document_review_queue")
      .update({
        matched_supplier_id: supplierId,
        supplier_match_status: "matched",
        supplier_approved_at: new Date().toISOString(),
        supplier_approved_by: userId,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, supplierId };
  });

/** Checkpoint 2 — approve the accounting classification. */
export const approveQueueClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        classificationId: z.string().uuid(),
        projectId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);

    const { error } = await supabase
      .from("financial_document_review_queue")
      .update({
        suggested_classification_id: data.classificationId,
        created_project_id: data.projectId ?? null,
        classification_approved_at: new Date().toISOString(),
        classification_approved_by: userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * Final write — only allowed when BOTH checkpoints are approved.
 * Creates one `financial_documents` expense per document group (an invoice and
 * its receipt are one transaction) and stamps the ids back onto the queue rows.
 */
export const finalizeQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);

    const { data: row, error } = await supabase
      .from("financial_document_review_queue")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (!row.supplier_approved_at || !row.classification_approved_at) {
      throw new Error("Both supplier and classification must be approved first");
    }
    if (row.status === "approved" && row.created_expense_id) {
      return { ok: true, documentId: row.created_expense_id as string };
    }

    // One expense per linked document group.
    const { data: groupRows } = await supabase
      .from("financial_document_review_queue")
      .select("id, created_expense_id")
      .eq("linked_document_group_id", row.linked_document_group_id);

    const existing = (groupRows ?? []).find((r) => r.created_expense_id)?.created_expense_id ?? null;

    let documentId = existing as string | null;
    if (!documentId) {
      const total = Number(row.extracted_amount ?? 0);
      const vat = Number(row.extracted_vat_amount ?? 0);
      const { data: supplier } = await supabase
        .from("companies")
        .select("nome")
        .eq("id", row.matched_supplier_id!)
        .maybeSingle();

      const { data: doc, error: docErr } = await supabase
        .from("financial_documents")
        .insert({
          doc_type: "supplier_invoice",
          direction: "received",
          source: "ocr",
          status: "issued",
          document_number: row.extracted_document_number,
          issue_date: row.extracted_date ?? new Date().toISOString().slice(0, 10),
          due_date: row.extracted_due_date,
          counterparty_supplier_id: row.matched_supplier_id,
          counterparty_name_snapshot: supplier?.nome ?? row.extracted_supplier_name,
          classification_id: row.suggested_classification_id,
          project_id: row.created_project_id,
          not_project_related: !row.created_project_id,
          currency: row.extracted_currency ?? "EUR",
          subtotal_ex_vat: Math.max(total - vat, 0),
          vat_amount: vat,
          total_inc_vat: total,
          file_path: row.source_file_url,
          ocr_metadata: row.raw_extraction,
          created_by: userId,
        })
        .select("id")
        .single();
      if (docErr) throw new Error(docErr.message);
      documentId = doc.id;
    }

    const { error: stampErr } = await supabase
      .from("financial_document_review_queue")
      .update({
        status: "approved",
        created_expense_id: documentId,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("linked_document_group_id", row.linked_document_group_id)
      .not("supplier_approved_at", "is", null)
      .not("classification_approved_at", "is", null);
    if (stampErr) throw new Error(stampErr.message);

    return { ok: true, documentId };
  });

/** Reject — keeps the row and the source file for audit, writes nothing. */
export const rejectQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { error } = await supabase
      .from("financial_document_review_queue")
      .update({
        status: "rejected",
        rejection_reason: data.reason ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
