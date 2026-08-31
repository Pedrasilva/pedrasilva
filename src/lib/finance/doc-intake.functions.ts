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

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertFinanceAccess(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: hasFinance }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_permission", { _user_id: userId, _key: "finance.dashboard" }),
  ]);
  if (!isAdmin && !hasFinance) {
    throw new Response("Forbidden: finance access required", { status: 403 });
  }
}

/** BEN, BEN.FOOD, BEN.HEALTH, BEN.OTHER, BEN.PERS … — the staff-benefit group. */
function isBenefitCode(code: string | null | undefined): boolean {
  return !!code && (code === "BEN" || code.startsWith("BEN."));
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

    const { ingestStoredDocument } = await import("@/lib/finance/doc-intake.server");
    return ingestStoredDocument({
      bucket: data.bucket,
      storagePath: data.storagePath,
      originalFilename: data.originalFilename ?? null,
      source: data.source,
      createdBy: userId,
    });
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
      const nif = (data.newSupplier.nif ?? "").replace(/\D/g, "") || null;

      // A company with this NIF may already exist (client, supplier, or both).
      // Reuse it and flag it as a supplier instead of violating the unique NIF index.
      let existingId: string | null = null;
      if (nif) {
        const { data: existing, error: findErr } = await supabase
          .from("companies")
          .select("id")
          .eq("nif", nif)
          .maybeSingle();
        if (findErr) throw new Error(findErr.message);
        existingId = existing?.id ?? null;
      }

      if (existingId) {
        const { error: flagErr } = await supabase
          .from("companies")
          .update({ is_supplier: true })
          .eq("id", existingId);
        if (flagErr) throw new Error(flagErr.message);
        supplierId = existingId;
      } else {
        const { data: created, error } = await supabase
          .from("companies")
          .insert({
            nome: data.newSupplier.nome,
            nif,
            email: data.newSupplier.email ?? null,
            is_supplier: true,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        supplierId = created.id;
      }
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

/**
 * Checkpoint 1 (issued documents) — approve the CLIENT counterparty.
 *
 * Mirror of `approveQueueSupplier` for documents the firm itself issued:
 * matching/creation is identical, but the company is flagged `is_client`
 * and stored in `matched_client_id`, so an issued invoice can never enter
 * the suppliers list.
 */
export const approveQueueClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        newClient: z
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

    let clientId = data.clientId ?? null;
    if (!clientId && data.newClient) {
      const nif = (data.newClient.nif ?? "").replace(/\D/g, "") || null;

      let existingId: string | null = null;
      if (nif) {
        const { data: existing, error: findErr } = await supabase
          .from("companies")
          .select("id")
          .eq("nif", nif)
          .maybeSingle();
        if (findErr) throw new Error(findErr.message);
        existingId = existing?.id ?? null;
      }

      if (existingId) {
        const { error: flagErr } = await supabase
          .from("companies")
          .update({ is_client: true })
          .eq("id", existingId);
        if (flagErr) throw new Error(flagErr.message);
        clientId = existingId;
      } else {
        const { data: created, error } = await supabase
          .from("companies")
          .insert({
            nome: data.newClient.nome,
            nif,
            email: data.newClient.email ?? null,
            is_client: true,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        clientId = created.id;
      }
    }

    if (!clientId) throw new Error("A client must be selected or created before approval");

    const { error: upErr } = await supabase
      .from("financial_document_review_queue")
      .update({
        matched_client_id: clientId,
        client_match_status: "matched",
        supplier_approved_at: new Date().toISOString(),
        supplier_approved_by: userId,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, clientId };
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
        assignedCollaboratorId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);

    // Benefit codes (BEN.*) must name the staff member the benefit is for.
    const { data: cls } = await supabase
      .from("financial_classifications")
      .select("code")
      .eq("id", data.classificationId)
      .maybeSingle();
    const isBenefit = isBenefitCode(cls?.code ?? null);
    if (isBenefit && !data.assignedCollaboratorId) {
      throw new Error("A staff member must be assigned for benefit classifications");
    }

    const { error } = await supabase
      .from("financial_document_review_queue")
      .update({
        suggested_classification_id: data.classificationId,
        suggested_classification_code: cls?.code ?? null,
        created_project_id: data.projectId ?? null,
        assigned_collaborator_id: isBenefit ? data.assignedCollaboratorId! : null,
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

    const isIssued = (row as { direction?: string }).direction === "issued";

    let documentId = existing as string | null;
    if (!documentId) {
      const total = Number(row.extracted_amount ?? 0);
      const vat = Number(row.extracted_vat_amount ?? 0);
      // IRS withheld at source is never owed to the supplier — it becomes a
      // separate liability towards the tax authority (see tax_withholdings).
      const withholdingRaw = Number(
        (row as { extracted_withholding_amount?: number | null }).extracted_withholding_amount ?? 0,
      );
      const withholding =
        Number.isFinite(withholdingRaw) && withholdingRaw > 0
          ? Math.min(Math.abs(withholdingRaw), total)
          : 0;

      const counterpartyId = isIssued
        ? ((row as { matched_client_id?: string | null }).matched_client_id ?? null)
        : row.matched_supplier_id;
      if (!counterpartyId) {
        throw new Error(
          isIssued
            ? "A client must be approved before finalizing an issued document"
            : "A supplier must be approved before finalizing",
        );
      }
      const { data: counterparty } = await supabase
        .from("companies")
        .select("nome")
        .eq("id", counterpartyId)
        .maybeSingle();

      const { data: doc, error: docErr } = await supabase
        .from("financial_documents")
        .insert({
          doc_type: isIssued ? "client_invoice" : "supplier_invoice",
          direction: isIssued ? "issued" : "received",
          source: "ocr",
          status: "issued",
          document_number: row.extracted_document_number,
          issue_date: row.extracted_date ?? new Date().toISOString().slice(0, 10),
          due_date: row.extracted_due_date,
          counterparty_supplier_id: isIssued ? null : counterpartyId,
          counterparty_client_id: isIssued ? counterpartyId : null,
          counterparty_name_snapshot:
            counterparty?.nome ??
            (isIssued
              ? (row as { extracted_buyer_name?: string | null }).extracted_buyer_name ?? null
              : row.extracted_supplier_name),
          classification_id: row.suggested_classification_id,
          project_id: row.created_project_id,
          not_project_related: !row.created_project_id,
          currency: row.extracted_currency ?? "EUR",
          subtotal_ex_vat: Math.max(total - vat, 0),
          vat_amount: vat,
          total_inc_vat: total,
          withholding_tax_amount: withholding,

          file_path: row.source_file_url,
          ocr_metadata: row.raw_extraction,
          // Ingestion-time payment signals carry over to the live document so
          // Payables can exclude items the document itself says are settled.
          billed_to_own_vat: !!(row as { buyer_vat_is_own?: boolean }).buyer_vat_is_own,
          payment_method_extracted:
            (row as { extracted_payment_method?: string | null }).extracted_payment_method ?? null,
          card_last4: (row as { extracted_card_last4?: string | null }).extracted_card_last4 ?? null,
          paid_from_account_id:
            (row as { paid_from_account_id?: string | null }).paid_from_account_id ?? null,
          payment_status:
            (row as { payment_status?: string | null }).payment_status === "paid_at_source"
              ? "paid_at_source"
              : "awaiting_payment",
          created_by: userId,

        })
        .select("id")
        .single();
      if (docErr) throw new Error(docErr.message);
      documentId = doc.id;
    }

    // ---- Inventory intake marker -----------------------------------------
    // Finance stays the single financial record. When the reviewer flagged the
    // invoice as containing physical items we only (a) set the workflow marker
    // and (b) materialise the extracted lines so Inventory can turn the
    // physical ones into assets. No expense is duplicated.
    if ((row as { mark_for_inventory?: boolean | null }).mark_for_inventory) {
      const { data: existingLines } = await supabase
        .from("financial_document_lines")
        .select("id")
        .eq("document_id", documentId!)
        .limit(1);

      if (!existingLines || existingLines.length === 0) {
        const raw = (row.raw_extraction ?? {}) as {
          line_items?: Array<{
            description?: string | null;
            quantity?: number | null;
            unit_price_ex_vat?: number | null;
            amount_ex_vat?: number | null;
            vat_rate?: number | null;
          }> | null;
        };
        const items = Array.isArray(raw.line_items) ? raw.line_items : [];
        if (items.length > 0) {
          const rows = items.map((it, i) => {
            const qty = Number(it.quantity ?? 1) || 1;
            const amount =
              it.amount_ex_vat != null
                ? Number(it.amount_ex_vat)
                : it.unit_price_ex_vat != null
                  ? Number(it.unit_price_ex_vat) * qty
                  : null;
            return {
              document_id: documentId!,
              description: (it.description ?? "").trim() || `Item ${i + 1}`,
              quantity: qty,
              unit_price_ex_vat:
                it.unit_price_ex_vat != null
                  ? Number(it.unit_price_ex_vat)
                  : amount != null
                    ? amount / qty
                    : null,
              amount_ex_vat: amount,
              vat_rate: it.vat_rate != null ? Number(it.vat_rate) : null,
              sort_order: i,
              project_id: row.created_project_id,
              classification_id: row.suggested_classification_id,
            };
          });
          const { error: lineErr } = await supabase
            .from("financial_document_lines")
            .insert(rows as never);
          if (lineErr) throw new Error(lineErr.message);
        }
      }

      const { error: invErr } = await supabase
        .from("financial_documents")
        .update({ inventory_status: "pending" } as never)
        .eq("id", documentId!)
        .is("inventory_status", null);
      if (invErr) throw new Error(invErr.message);
    }

    // ---- Benefit documents also land on the employee's HR dashboard -------
    // Same document, one extra row: an HR benefit expense in `pendente`,
    // waiting for HR approval, linked back to the finance document.
    const assignedCollaboratorId =
      (row as { assigned_collaborator_id?: string | null }).assigned_collaborator_id ?? null;
    const benefitAmount = Number(row.extracted_amount ?? 0);
    if (
      assignedCollaboratorId &&
      benefitAmount > 0 &&
      isBenefitCode(row.suggested_classification_code)
    ) {
      // The reviewer is a finance user writing a row that belongs to somebody
      // else, so RLS ("own expenses") cannot apply — use the admin client,
      // after assertFinanceAccess above has authorised the caller.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: already } = await supabaseAdmin
        .from("benefit_expenses")
        .select("id")
        .eq("financial_document_id", documentId!)
        .maybeSingle();

      if (!already) {
        const { data: cat } = await supabase
          .from("benefit_categories")
          .select("id, legacy_enum, classification_id")
          .eq("classification_id", row.suggested_classification_id!)
          .eq("active", true)
          .order("sort_order")
          .limit(1)
          .maybeSingle();

        const expenseDate = row.extracted_date ?? new Date().toISOString().slice(0, 10);
        const { error: benErr } = await supabaseAdmin.from("benefit_expenses").insert({
          collaborator_id: assignedCollaboratorId,
          ano_fiscal: Number(expenseDate.slice(0, 4)),
          categoria: (cat?.legacy_enum ?? "outros") as "carro" | "ticket" | "premio" | "outros",
          category_id: cat?.id ?? null,
          classification_id: row.suggested_classification_id,
          descricao:
            row.extracted_supplier_name ??
            row.original_filename ??
            row.suggested_classification_code ??
            "Benefício",
          valor: benefitAmount,
          data_despesa: expenseDate,
          estado: "pendente",
          origin: "finance",
          financial_document_id: documentId,
          supplier_company_id: row.matched_supplier_id,
          supplier_name_snapshot: row.extracted_supplier_name,
          supplier_nif: row.extracted_supplier_vat,
          document_number: row.extracted_document_number,
          vat_amount: Number(row.extracted_vat_amount ?? 0) || null,
          foto_path: row.source_file_url,
        });
        if (benErr) throw new Error(benErr.message);
      }

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

/**
 * Re-run extraction on a pending queue item (e.g. after a direction-detection
 * fix). Never touches approved/rejected rows.
 */
export const reprocessQueueItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<IngestResult> => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);
    const { reprocessQueueItem } = await import("@/lib/finance/doc-intake.server");
    return reprocessQueueItem(data.id);
  });


/**
 * Materialise invoice lines for an existing financial document.
 *
 * Documents filed before line extraction existed (or whose original OCR ran
 * without a line table) have no rows in `financial_document_lines`, which
 * leaves the Finance → Inventory intake with nothing to turn into assets.
 * This re-reads the stored file, extracts the printed line table and inserts
 * the lines. It never touches the document's financial totals, and it is a
 * no-op when lines already exist.
 */
export const extractDocumentLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; created: number; error?: string }> => {
    const { supabase, userId } = context;
    await assertFinanceAccess(supabase, userId);

    const { data: doc, error: docErr } = await supabase
      .from("financial_documents")
      .select("id, file_path, ocr_metadata, project_id, classification_id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) return { ok: false, created: 0, error: "document not found" };

    const { data: existing } = await supabase
      .from("financial_document_lines")
      .select("id")
      .eq("document_id", data.documentId)
      .limit(1);
    if (existing && existing.length > 0) return { ok: true, created: 0 };

    type RawLine = {
      description?: string | null;
      quantity?: number | null;
      unit_price_ex_vat?: number | null;
      amount_ex_vat?: number | null;
      vat_rate?: number | null;
    };
    const fromMeta = (doc as { ocr_metadata?: { line_items?: RawLine[] | null } | null })
      .ocr_metadata?.line_items;
    let items: RawLine[] = Array.isArray(fromMeta) ? fromMeta : [];

    if (items.length === 0) {
      const path = (doc as { file_path?: string | null }).file_path;
      if (!path) return { ok: false, created: 0, error: "document has no stored file" };
      const { extractDocument } = await import("@/lib/finance/doc-intake.server");
      const res = await extractDocument("financial-documents", path);
      if (!res.ok) return { ok: false, created: 0, error: res.error };
      items = Array.isArray(res.extraction.line_items) ? res.extraction.line_items : [];
      // Keep the freshest extraction on the document for future reads.
      await supabase
        .from("financial_documents")
        .update({ ocr_metadata: res.raw as never })
        .eq("id", data.documentId);
    }

    if (items.length === 0) return { ok: true, created: 0, error: "no line table on document" };

    const rows = items.map((it, i) => {
      const qty = Number(it.quantity ?? 1) || 1;
      const amount =
        it.amount_ex_vat != null
          ? Number(it.amount_ex_vat)
          : it.unit_price_ex_vat != null
            ? Number(it.unit_price_ex_vat) * qty
            : null;
      return {
        document_id: data.documentId,
        description: (it.description ?? "").trim() || `Item ${i + 1}`,
        quantity: qty,
        unit_price_ex_vat:
          it.unit_price_ex_vat != null
            ? Number(it.unit_price_ex_vat)
            : amount != null
              ? amount / qty
              : null,
        amount_ex_vat: amount,
        vat_rate: it.vat_rate != null ? Number(it.vat_rate) : null,
        sort_order: i,
        project_id: (doc as { project_id?: string | null }).project_id ?? null,
        classification_id: (doc as { classification_id?: string | null }).classification_id ?? null,
      };
    });
    const { error: insErr } = await supabase
      .from("financial_document_lines")
      .insert(rows as never);
    if (insErr) throw new Error(insErr.message);
    return { ok: true, created: rows.length };
  });
