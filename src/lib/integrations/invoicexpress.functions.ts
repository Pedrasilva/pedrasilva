/**
 * InvoiceXpress integration — issue AT-certified Portuguese invoices.
 *
 * Reads INVOICEXPRESS_ACCOUNT_NAME and INVOICEXPRESS_API_KEY inside .handler()
 * so secrets are only read on the server at call time.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IX_DOC_TYPE: Record<string, "invoices" | "credit_notes"> = {
  client_invoice: "invoices",
  client_credit_note: "credit_notes",
};

type IXEnv = { account: string; apiKey: string };

function getEnv(): IXEnv {
  const account = process.env.INVOICEXPRESS_ACCOUNT_NAME;
  const apiKey = process.env.INVOICEXPRESS_API_KEY;
  if (!account) throw new Error("INVOICEXPRESS_ACCOUNT_NAME is not configured");
  if (!apiKey) throw new Error("INVOICEXPRESS_API_KEY is not configured");
  return { account, apiKey };
}

function baseUrl(env: IXEnv, path: string): string {
  return `https://${env.account}.app.invoicexpress.com${path}?api_key=${encodeURIComponent(env.apiKey)}`;
}

async function ixFetch(env: IXEnv, path: string, init: RequestInit = {}) {
  const res = await fetch(baseUrl(env, path), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json error body */
  }
  if (!res.ok) {
    const detail =
      json && typeof json === "object"
        ? JSON.stringify(json)
        : text.slice(0, 500);
    throw new Error(`InvoiceXpress ${res.status}: ${detail}`);
  }
  return json as Record<string, unknown> | null;
}

/**
 * Issue a financial_documents row as a certified invoice on InvoiceXpress.
 * Creates the invoice as draft, finalises it, then writes the ATCUD,
 * series, PDF permalink and external id back to financial_documents.
 */
export const issueFiscalInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const env = getEnv();

    // 1) Load doc + lines + client
    const { data: doc, error: e1 } = await supabase
      .from("financial_documents")
      .select("*")
      .eq("id", data.documentId)
      .single();
    if (e1 || !doc) throw new Error(e1?.message ?? "Document not found");

    if (doc.direction !== "issued") {
      throw new Error("Only issued documents can be sent to InvoiceXpress");
    }
    if (doc.invoicexpress_id) {
      throw new Error("This document was already issued to InvoiceXpress");
    }

    const ixType = IX_DOC_TYPE[doc.doc_type as string];
    if (!ixType) {
      throw new Error(`Unsupported doc_type for InvoiceXpress: ${doc.doc_type}`);
    }

    const { data: lines, error: e2 } = await supabase
      .from("financial_document_lines")
      .select("*")
      .eq("document_id", doc.id)
      .order("sort_order", { ascending: true });
    if (e2) throw new Error(e2.message);
    if (!lines || lines.length === 0) {
      throw new Error("Document has no lines");
    }

    let clientName = doc.counterparty_name_snapshot ?? "Cliente";
    let clientPayload: Record<string, unknown> = { name: clientName };
    if (doc.counterparty_client_id) {
      const { data: c } = await supabase
        .from("companies")
        .select("nome, nif, morada, postal_code, city, email, code")
        .eq("id", doc.counterparty_client_id)
        .single();
      if (c) {
        clientName = c.nome;
        clientPayload = {
          name: c.nome,
          code: c.code || c.nif || doc.counterparty_client_id,
          fiscal_id: c.nif ?? undefined,
          address: c.morada ?? undefined,
          postal_code: c.postal_code ?? undefined,
          city: c.city ?? undefined,
          email: c.email ?? undefined,
          country: "Portugal",
          language: "PT",
        };
      }
    }

    // 2) Build create payload
    const createPayload: Record<string, unknown> = {
      [ixType === "invoices" ? "invoice" : "credit_note"]: {
        date: doc.issue_date,
        due_date: doc.due_date ?? doc.issue_date,
        reference: doc.external_reference ?? undefined,
        observations: doc.notes ?? undefined,
        client: clientPayload,
        items: lines.map((l) => ({
          name: (l.description || "Item").slice(0, 80),
          description: l.description,
          unit_price: Number(l.unit_price_ex_vat),
          quantity: Number(l.quantity),
          unit: "unit",
          tax: { name: l.vat_rate > 0 ? "IVA23" : "ISE", value: Number(l.vat_rate) },
        })),
      },
    };

    // 3) Create as draft
    const created = (await ixFetch(env, `/${ixType}.json`, {
      method: "POST",
      body: JSON.stringify(createPayload),
    })) as Record<string, any> | null;

    const root =
      (created?.invoice as Record<string, any> | undefined) ??
      (created?.credit_note as Record<string, any> | undefined) ??
      (created?.simplified_invoice as Record<string, any> | undefined);
    if (!root?.id) {
      throw new Error("InvoiceXpress did not return an id");
    }
    const ixId: number = root.id;

    // 4) Finalise
    const finalised = (await ixFetch(
      env,
      `/${ixType}/${ixId}/change-state.json`,
      {
        method: "PUT",
        body: JSON.stringify({
          [ixType === "invoices" ? "invoice" : "credit_note"]: {
            state: "finalized",
          },
        }),
      },
    )) as Record<string, any> | null;

    const finalRoot =
      (finalised?.invoice as Record<string, any> | undefined) ??
      (finalised?.credit_note as Record<string, any> | undefined) ??
      root;

    // 5) Persist back
    const patch = {
      invoicexpress_id: ixId,
      invoicexpress_type: ixType,
      invoicexpress_status: finalRoot.status ?? "finalized",
      atcud: finalRoot.atcud ?? null,
      series: finalRoot.sequence_number ?? finalRoot.series ?? null,
      document_number: finalRoot.inverted_sequence_number ?? doc.document_number,
      permalink_pdf: finalRoot.permalink ?? root.permalink ?? null,
      issued_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      last_sync_error: null,
      status: "issued" as const,
    };

    const { error: e3 } = await supabase
      .from("financial_documents")
      .update(patch)
      .eq("id", doc.id);
    if (e3) {
      // Stamp the error but don't lose the IX id
      await supabase
        .from("financial_documents")
        .update({
          invoicexpress_id: ixId,
          last_sync_error: e3.message,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
      throw new Error(`Issued on InvoiceXpress but failed to save locally: ${e3.message}`);
    }

    return {
      ok: true as const,
      invoicexpress_id: ixId,
      atcud: patch.atcud,
      permalink_pdf: patch.permalink_pdf,
      document_number: patch.document_number,
    };
  });

/**
 * Send the finalised invoice by email through InvoiceXpress.
 */
export const sendFiscalInvoiceByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        documentId: z.string().uuid(),
        email: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const env = getEnv();

    const { data: doc, error } = await supabase
      .from("financial_documents")
      .select("invoicexpress_id, invoicexpress_type")
      .eq("id", data.documentId)
      .single();
    if (error || !doc?.invoicexpress_id) {
      throw new Error("Document not issued on InvoiceXpress yet");
    }
    const ixType = doc.invoicexpress_type ?? "invoices";

    await ixFetch(env, `/${ixType}/${doc.invoicexpress_id}/email-document.json`, {
      method: "PUT",
      body: JSON.stringify({
        message: {
          client: { email: data.email, save: "0" },
          subject: "Fatura",
          body: "Em anexo segue a fatura. Obrigado.",
        },
      }),
    });

    return { ok: true as const };
  });
