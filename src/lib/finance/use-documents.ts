/**
 * Financial documents data layer.
 *
 * `financial_documents` is the VAT/accrual source of truth.
 * `bank_transactions` remain the immutable cash truth.
 * `financial_document_payments` bridges the two.
 *
 * Hooks here cover: list, get-with-lines-and-payments, create, update,
 * cancel, payment add/remove, and a VAT period summary.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type FinDoc = Database["public"]["Tables"]["financial_documents"]["Row"];
export type FinDocInsert =
  Database["public"]["Tables"]["financial_documents"]["Insert"];
export type FinDocUpdate =
  Database["public"]["Tables"]["financial_documents"]["Update"];
export type FinDocLine =
  Database["public"]["Tables"]["financial_document_lines"]["Row"];
export type FinDocLineInsert =
  Database["public"]["Tables"]["financial_document_lines"]["Insert"];
export type FinDocPayment =
  Database["public"]["Tables"]["financial_document_payments"]["Row"];
export type FinDocPaymentInsert =
  Database["public"]["Tables"]["financial_document_payments"]["Insert"];

export type FinDocType = FinDoc["doc_type"];
export type FinDocDirection = FinDoc["direction"];
export type FinDocSource = FinDoc["source"];
export type FinDocStatus = FinDoc["status"];

export type DocumentFilters = {
  docType?: FinDocType | null;
  direction?: FinDocDirection | null;
  status?: FinDocStatus | null;
  supplierId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  /** First day of the VAT period (YYYY-MM-01). */
  vatPeriod?: string | null;
  search?: string | null;
};

const ROOT_KEY = ["fin-docs"] as const;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function useFinDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: [...ROOT_KEY, "list", filters],
    queryFn: async (): Promise<FinDoc[]> => {
      let q = supabase
        .from("financial_documents")
        .select("*")
        .order("issue_date", { ascending: false })
        .limit(500);

      if (filters.docType) q = q.eq("doc_type", filters.docType);
      if (filters.direction) q = q.eq("direction", filters.direction);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.supplierId)
        q = q.eq("counterparty_supplier_id", filters.supplierId);
      if (filters.clientId)
        q = q.eq("counterparty_client_id", filters.clientId);
      if (filters.projectId) q = q.eq("project_id", filters.projectId);
      if (filters.vatPeriod) q = q.eq("vat_period", filters.vatPeriod);
      if (filters.search) {
        const s = filters.search.trim();
        if (s.length > 0) {
          q = q.or(
            `document_number.ilike.%${s}%,external_reference.ilike.%${s}%,counterparty_name_snapshot.ilike.%${s}%`,
          );
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Single document (header + lines + payments)
// ---------------------------------------------------------------------------

export type FinDocFull = {
  document: FinDoc;
  lines: FinDocLine[];
  payments: FinDocPayment[];
};

export function useFinDocument(documentId: string | null) {
  return useQuery({
    queryKey: [...ROOT_KEY, "one", documentId],
    enabled: !!documentId,
    queryFn: async (): Promise<FinDocFull | null> => {
      if (!documentId) return null;
      const [docRes, linesRes, paymentsRes] = await Promise.all([
        supabase
          .from("financial_documents")
          .select("*")
          .eq("id", documentId)
          .single(),
        supabase
          .from("financial_document_lines")
          .select("*")
          .eq("document_id", documentId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("financial_document_payments")
          .select("*")
          .eq("document_id", documentId)
          .order("payment_date", { ascending: false }),
      ]);
      if (docRes.error) throw docRes.error;
      if (linesRes.error) throw linesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      return {
        document: docRes.data as FinDoc,
        lines: (linesRes.data ?? []) as FinDocLine[],
        payments: (paymentsRes.data ?? []) as FinDocPayment[],
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Compute totals from lines (mirrors generated columns)
// ---------------------------------------------------------------------------

export function computeLineTotals(line: {
  quantity: number;
  unit_price_ex_vat: number;
  vat_rate: number;
}) {
  const ex = round2(line.quantity * line.unit_price_ex_vat);
  const vat = round2((line.quantity * line.unit_price_ex_vat * line.vat_rate) / 100);
  const inc = round2(ex + vat);
  return { ex, vat, inc };
}

export function computeDocTotals(
  lines: Array<{ quantity: number; unit_price_ex_vat: number; vat_rate: number }>,
) {
  let subtotal = 0;
  let vat = 0;
  let total = 0;
  for (const l of lines) {
    const t = computeLineTotals(l);
    subtotal += t.ex;
    vat += t.vat;
    total += t.inc;
  }
  return {
    subtotal_ex_vat: round2(subtotal),
    vat_amount: round2(vat),
    total_inc_vat: round2(total),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export type DocumentInputLine = {
  description: string;
  quantity: number;
  unit_price_ex_vat: number;
  vat_rate: number;
  vat_code?: string | null;
  classification_id?: string | null;
  project_id?: string | null;
  reimbursable?: boolean;
  notes?: string | null;
  sort_order?: number;
};

export type DocumentInput = {
  doc_type: FinDocType;
  direction: FinDocDirection;
  status?: FinDocStatus;
  source?: FinDocSource;
  document_number?: string | null;
  external_reference?: string | null;
  issue_date: string;
  due_date?: string | null;
  counterparty_supplier_id?: string | null;
  counterparty_client_id?: string | null;
  counterparty_name_snapshot?: string | null;
  project_id?: string | null;
  classification_id?: string | null;
  currency?: string;
  notes?: string | null;
  file_path?: string | null;
};

export function useCreateFinDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      header: DocumentInput;
      lines: DocumentInputLine[];
    }) => {
      const totals = computeDocTotals(payload.lines);
      const { data: doc, error } = await supabase
        .from("financial_documents")
        .insert({
          ...payload.header,
          source: payload.header.source ?? "manual",
          status: payload.header.status ?? "draft",
          currency: payload.header.currency ?? "EUR",
          ...totals,
        } as FinDocInsert)
        .select("*")
        .single();
      if (error) throw error;

      if (payload.lines.length > 0) {
        const rows: FinDocLineInsert[] = payload.lines.map((l, i) => ({
          ...l,
          document_id: doc.id,
          sort_order: l.sort_order ?? i,
        }));
        const { error: e2 } = await supabase
          .from("financial_document_lines")
          .insert(rows);
        if (e2) throw e2;
      }

      return doc as FinDoc;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useUpdateFinDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      header: Partial<DocumentInput>;
      /**
       * If provided, REPLACES the line set: we delete-all then insert.
       * If undefined, lines are left untouched.
       */
      lines?: DocumentInputLine[];
    }) => {
      let nextHeader: Partial<FinDocUpdate> = { ...payload.header };
      if (payload.lines) {
        nextHeader = { ...nextHeader, ...computeDocTotals(payload.lines) };
      }
      const { error } = await supabase
        .from("financial_documents")
        .update(nextHeader)
        .eq("id", payload.id);
      if (error) throw error;

      if (payload.lines) {
        const { error: eDel } = await supabase
          .from("financial_document_lines")
          .delete()
          .eq("document_id", payload.id);
        if (eDel) throw eDel;
        if (payload.lines.length > 0) {
          const rows: FinDocLineInsert[] = payload.lines.map((l, i) => ({
            ...l,
            document_id: payload.id,
            sort_order: l.sort_order ?? i,
          }));
          const { error: eIns } = await supabase
            .from("financial_document_lines")
            .insert(rows);
          if (eIns) throw eIns;
        }
      }
      return payload.id;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
      qc.invalidateQueries({ queryKey: [...ROOT_KEY, "one", vars.id] });
    },
  });
}

/** No deletion: documents are cancelled, never destroyed. */
export function useCancelFinDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("financial_documents")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
      qc.invalidateQueries({ queryKey: [...ROOT_KEY, "one", id] });
    },
  });
}

/** Move draft → issued (no payment side effect; trigger handles paid status). */
export function useIssueFinDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("financial_documents")
        .update({ status: "issued" })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
      qc.invalidateQueries({ queryKey: [...ROOT_KEY, "one", id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export function useAddFinDocPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FinDocPaymentInsert) => {
      const { data, error } = await supabase
        .from("financial_document_payments")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as FinDocPayment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
      qc.invalidateQueries({
        queryKey: [...ROOT_KEY, "one", vars.document_id],
      });
      qc.invalidateQueries({ queryKey: ["bank-tx-doc-matches"] });
    },
  });
}

export function useRemoveFinDocPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; documentId: string }) => {
      const { error } = await supabase
        .from("financial_document_payments")
        .delete()
        .eq("id", payload.id);
      if (error) throw error;
      return payload;
    },
    onSuccess: (vars) => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
      qc.invalidateQueries({
        queryKey: [...ROOT_KEY, "one", vars.documentId],
      });
      qc.invalidateQueries({ queryKey: ["bank-tx-doc-matches"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

export function useFinSuppliers() {
  return useQuery({
    queryKey: ["fin-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
}

export function useFinClients() {
  return useQuery({
    queryKey: ["fin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
}

export function useFinProjects() {
  return useQuery({
    queryKey: ["pm-projects-pick"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_projects")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
}

export function useFinClassifications() {
  return useQuery({
    queryKey: ["fin-classifications-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications")
        .select("id, code, name_pt, name_en, level, financial_nature, spending_policy")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Bank-transaction ↔ document matching helpers
// ---------------------------------------------------------------------------

export type BankTxLite = {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  status: string;
};

/**
 * Suggested unmatched bank transactions for a document. Filters by sign of
 * `amount` (issued docs expect credits / positive; received docs expect debits
 * / negative) and by date proximity to the document's issue/due date.
 */
export function useUnmatchedBankTxForDoc(doc: FinDoc | null) {
  return useQuery({
    queryKey: ["bank-tx-doc-matches", doc?.id, doc?.outstanding_amount],
    enabled: !!doc,
    queryFn: async (): Promise<BankTxLite[]> => {
      if (!doc) return [];
      // Issued docs we receive money for → positive amount.
      // Received docs we pay → negative amount.
      const wantPositive = doc.direction === "issued";
      const { data, error } = await supabase
        .from("bank_transactions")
        .select(
          "id, bank_account_id, transaction_date, description, amount, status",
        )
        .order("transaction_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as BankTxLite[]).filter((t) =>
        wantPositive ? Number(t.amount) > 0 : Number(t.amount) < 0,
      );
    },
  });
}

/** All payments matched to a given bank transaction (for the bank-side view). */
export function usePaymentsForBankTx(bankTransactionId: string | null) {
  return useQuery({
    queryKey: ["bank-tx-payments", bankTransactionId],
    enabled: !!bankTransactionId,
    queryFn: async () => {
      if (!bankTransactionId) return [];
      const { data, error } = await supabase
        .from("financial_document_payments")
        .select("*, document:financial_documents(*)")
        .eq("bank_transaction_id", bankTransactionId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// VAT summary
// ---------------------------------------------------------------------------

export type VatSummaryRow = {
  /** YYYY-MM-01 */
  vat_period: string;
  output_vat_accrued: number; // VAT we collected on issued invoices
  input_vat_accrued: number; // VAT we paid on received invoices
  vat_payable: number; // output - input
  output_vat_paid_est: number; // proportional to paid_amount
  input_vat_paid_est: number;
  vat_outstanding: number; // accrued payable - paid net
};

/** Aggregated VAT summary per period across all non-cancelled documents. */
export function useVatSummary(year?: number) {
  return useQuery({
    queryKey: ["fin-vat-summary", year ?? "all"],
    queryFn: async (): Promise<VatSummaryRow[]> => {
      let q = supabase
        .from("financial_documents")
        .select(
          "vat_period, direction, vat_amount, total_inc_vat, paid_amount, status",
        )
        .neq("status", "cancelled");

      if (year) {
        q = q
          .gte("issue_date", `${year}-01-01`)
          .lt("issue_date", `${year + 1}-01-01`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const map = new Map<string, VatSummaryRow>();
      for (const r of data ?? []) {
        if (!r.vat_period) continue;
        const key = r.vat_period as string;
        const row =
          map.get(key) ??
          ({
            vat_period: key,
            output_vat_accrued: 0,
            input_vat_accrued: 0,
            vat_payable: 0,
            output_vat_paid_est: 0,
            input_vat_paid_est: 0,
            vat_outstanding: 0,
          } satisfies VatSummaryRow);

        const vat = Number(r.vat_amount ?? 0);
        const total = Number(r.total_inc_vat ?? 0);
        const paid = Number(r.paid_amount ?? 0);
        const ratio = total > 0 ? paid / total : 0;
        const paidVat = round2(vat * ratio);

        if (r.direction === "issued") {
          row.output_vat_accrued = round2(row.output_vat_accrued + vat);
          row.output_vat_paid_est = round2(row.output_vat_paid_est + paidVat);
        } else {
          row.input_vat_accrued = round2(row.input_vat_accrued + vat);
          row.input_vat_paid_est = round2(row.input_vat_paid_est + paidVat);
        }
        map.set(key, row);
      }

      // Derived fields
      for (const row of map.values()) {
        row.vat_payable = round2(row.output_vat_accrued - row.input_vat_accrued);
        const paidNet = round2(
          row.output_vat_paid_est - row.input_vat_paid_est,
        );
        row.vat_outstanding = round2(row.vat_payable - paidNet);
      }

      return Array.from(map.values()).sort((a, b) =>
        a.vat_period < b.vat_period ? 1 : -1,
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Statements (per supplier or client)
// ---------------------------------------------------------------------------

export type StatementParty =
  | { kind: "supplier"; id: string }
  | { kind: "client"; id: string };

export function useCounterpartyStatement(party: StatementParty | null) {
  return useQuery({
    queryKey: ["fin-statement", party?.kind, party?.id],
    enabled: !!party,
    queryFn: async () => {
      if (!party) return { documents: [], outstanding: 0 };
      const col =
        party.kind === "supplier"
          ? "counterparty_supplier_id"
          : "counterparty_client_id";
      const { data, error } = await supabase
        .from("financial_documents")
        .select("*")
        .eq(col, party.id)
        .neq("status", "cancelled")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      const docs = (data ?? []) as FinDoc[];
      const outstanding = docs.reduce(
        (s, d) => s + Number(d.outstanding_amount ?? 0),
        0,
      );
      return { documents: docs, outstanding: round2(outstanding) };
    },
  });
}
