/**
 * Receivables & Payables — firm-wide current-state operational data.
 *
 * Reads exclusively from data that already exists (financial_documents,
 * financial_document_payments, cost_categories, companies, pm_projects).
 * No forecasting here: outstanding now, aged now, and historical payment
 * behaviour computed from already-settled invoices.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VatMode } from "@/lib/finance/use-cashflow-report";

export type OutstandingInvoice = {
  id: string;
  clientId: string | null;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  documentNumber: string | null;
  amount: number;
  issueDate: string | null;
  dueDate: string | null;
  daysOverdue: number;
};

export type AgingBucketKey = "d0_30" | "d31_60" | "d61_90" | "d90p";

export type AgingClient = {
  clientId: string;
  clientName: string;
  amount: number;
  count: number;
};

export type AgingBucket = {
  key: AgingBucketKey;
  amount: number;
  count: number;
  clients: AgingClient[];
};

/** Per-client days-to-pay metric, computed from settled invoices only. */
export type ClientPaymentBehaviour = {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  avgDaysToPay: number;
  medianDaysToPay: number;
  totalPaid: number;
};

export type PayableInvoice = {
  id: string;
  vendorId: string | null;
  vendorName: string;
  documentNumber: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
  issueDate: string | null;
  dueDate: string | null;
  daysOverdue: number;
};

export type PayableVendor = {
  vendorId: string;
  vendorName: string;
  amount: number;
  count: number;
  share: number;
  overdue: number;
};

export type ReceivablesPayables = {
  outstanding: OutstandingInvoice[];
  outstandingTotal: number;
  overdueTotal: number;
  aging: AgingBucket[];
  behaviour: ClientPaymentBehaviour[];
  payables: PayableInvoice[];
  payablesTotal: number;
  payablesOverdue: number;
  vendors: PayableVendor[];
};

const UNKNOWN = "__unknown__";

function daysBetween(fromISO: string, toISO: string) {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISO + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function todayISO(now: Date) {
  return now.toISOString().slice(0, 10);
}

function amountOf(doc: any, vatMode: VatMode) {
  const inc = Number(doc.outstanding_amount ?? 0);
  if (vatMode === "inc") return inc;
  const totalInc = Number(doc.total_inc_vat ?? 0);
  const ex = Number(doc.subtotal_ex_vat ?? 0);
  if (!totalInc) return inc;
  return inc * (ex / totalInc);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type RawData = {
  issued: any[];
  received: any[];
  settled: any[];
  payments: { document_id: string; payment_date: string | null }[];
  projects: { id: string; name: string }[];
  companies: { id: string; nome: string | null }[];
  categories: { id: string; name: string }[];
  classifications: { id: string; cost_category_id: string | null }[];
};

const DOC_COLS = `id, document_number, issue_date, due_date, project_id,
  counterparty_client_id, counterparty_supplier_id, counterparty_name_snapshot,
  classification_id, cost_category_id, subtotal_ex_vat, total_inc_vat,
  paid_amount, outstanding_amount`;

function useReceivablesPayablesRaw() {
  return useQuery({
    queryKey: ["finance", "receivables-payables-raw"],
    queryFn: async (): Promise<RawData> => {
      const [issued, received, settled, projects, categories, cls] =
        await Promise.all([
          // Only "awaiting payment" is a genuine open item: documents that the
          // source itself reported as settled, and already-reconciled ones,
          // never belong in the outstanding/payables pipeline.
          supabase
            .from("financial_documents")
            .select(DOC_COLS)
            .eq("direction", "issued")
            .eq("payment_status", "awaiting_payment")
            .neq("status", "cancelled")
            .gt("outstanding_amount", 0),
          supabase
            .from("financial_documents")
            .select(DOC_COLS)
            .eq("direction", "received")
            .eq("payment_status", "awaiting_payment")
            .neq("status", "cancelled")
            .gt("outstanding_amount", 0),

          supabase
            .from("financial_documents")
            .select(
              `id, issue_date, counterparty_client_id,
               counterparty_name_snapshot, total_inc_vat, subtotal_ex_vat,
               paid_amount, outstanding_amount`,
            )
            .eq("direction", "issued")
            .neq("status", "cancelled")
            .lte("outstanding_amount", 0),
          supabase.from("pm_projects").select("id, name"),
          supabase.from("cost_categories").select("id, name"),
          supabase
            .from("financial_classifications")
            .select("id, cost_category_id"),
        ]);

      for (const r of [issued, received, settled, projects, categories, cls]) {
        if (r.error) throw r.error;
      }

      const settledIds = (settled.data ?? []).map((d: any) => d.id);
      let payments: any[] = [];
      for (let i = 0; i < settledIds.length; i += 500) {
        const chunk = settledIds.slice(i, i + 500);
        const { data, error } = await supabase
          .from("financial_document_payments")
          .select("document_id, payment_date")
          .in("document_id", chunk);
        if (error) throw error;
        payments = payments.concat(data ?? []);
      }

      const companyIds = Array.from(
        new Set(
          [
            ...(issued.data ?? []).flatMap((d: any) => [
              d.counterparty_client_id,
            ]),
            ...(received.data ?? []).map((d: any) => d.counterparty_supplier_id),
            ...(settled.data ?? []).map((d: any) => d.counterparty_client_id),
          ].filter(Boolean),
        ),
      ) as string[];

      let companies: any[] = [];
      for (let i = 0; i < companyIds.length; i += 500) {
        const chunk = companyIds.slice(i, i + 500);
        const { data, error } = await supabase
          .from("companies")
          .select("id, nome")
          .in("id", chunk);
        if (error) throw error;
        companies = companies.concat(data ?? []);
      }

      return {
        issued: issued.data ?? [],
        received: received.data ?? [],
        settled: settled.data ?? [],
        payments,
        projects: (projects.data ?? []) as any[],
        companies,
        categories: (categories.data ?? []) as any[],
        classifications: (cls.data ?? []) as any[],
      };
    },
  });
}

export function buildReceivablesPayables(
  raw: RawData,
  vatMode: VatMode,
  now = new Date(),
): ReceivablesPayables {
  const today = todayISO(now);
  const projectName = new Map(raw.projects.map((p) => [p.id, p.name]));
  const companyName = new Map(raw.companies.map((c) => [c.id, c.nome ?? ""]));
  const categoryName = new Map(raw.categories.map((c) => [c.id, c.name]));
  const clsCategory = new Map(
    raw.classifications.map((c) => [c.id, c.cost_category_id]),
  );

  // ---- Outstanding invoices ------------------------------------------------
  const outstanding: OutstandingInvoice[] = raw.issued.map((d: any) => {
    const clientId = d.counterparty_client_id ?? null;
    const ref = d.due_date ?? d.issue_date;
    const daysOverdue = ref ? Math.max(0, daysBetween(ref, today)) : 0;
    return {
      id: d.id,
      clientId,
      clientName:
        (clientId ? companyName.get(clientId) : null) ||
        d.counterparty_name_snapshot ||
        "",
      projectId: d.project_id ?? null,
      projectName: d.project_id ? (projectName.get(d.project_id) ?? null) : null,
      documentNumber: d.document_number ?? null,
      amount: amountOf(d, vatMode),
      issueDate: d.issue_date ?? null,
      dueDate: d.due_date ?? null,
      daysOverdue: d.due_date ? daysOverdue : 0,
    };
  });
  outstanding.sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount);

  const outstandingTotal = outstanding.reduce((s, r) => s + r.amount, 0);
  const overdueTotal = outstanding
    .filter((r) => r.daysOverdue > 0)
    .reduce((s, r) => s + r.amount, 0);

  // ---- Aging ---------------------------------------------------------------
  const bucketOf = (days: number): AgingBucketKey =>
    days <= 30 ? "d0_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90p";

  const buckets = new Map<
    AgingBucketKey,
    { amount: number; count: number; clients: Map<string, AgingClient> }
  >();
  for (const key of ["d0_30", "d31_60", "d61_90", "d90p"] as AgingBucketKey[]) {
    buckets.set(key, { amount: 0, count: 0, clients: new Map() });
  }
  for (const inv of outstanding) {
    const b = buckets.get(bucketOf(inv.daysOverdue))!;
    b.amount += inv.amount;
    b.count += 1;
    const ck = inv.clientId ?? UNKNOWN;
    const c = b.clients.get(ck) ?? {
      clientId: ck,
      clientName: inv.clientName,
      amount: 0,
      count: 0,
    };
    c.amount += inv.amount;
    c.count += 1;
    if (!c.clientName && inv.clientName) c.clientName = inv.clientName;
    b.clients.set(ck, c);
  }
  const aging: AgingBucket[] = Array.from(buckets.entries()).map(([key, b]) => ({
    key,
    amount: b.amount,
    count: b.count,
    clients: Array.from(b.clients.values()).sort((x, y) => y.amount - x.amount),
  }));

  // ---- Time to pay (settled invoices only) ---------------------------------
  const lastPayment = new Map<string, string>();
  for (const p of raw.payments) {
    if (!p.payment_date) continue;
    const prev = lastPayment.get(p.document_id);
    if (!prev || p.payment_date > prev) lastPayment.set(p.document_id, p.payment_date);
  }

  const behaviourMap = new Map<
    string,
    { name: string; days: number[]; total: number }
  >();
  for (const d of raw.settled as any[]) {
    const paidOn = lastPayment.get(d.id);
    if (!paidOn || !d.issue_date) continue;
    const days = daysBetween(d.issue_date, paidOn);
    if (days < 0) continue;
    const key = d.counterparty_client_id ?? UNKNOWN;
    const name =
      (d.counterparty_client_id ? companyName.get(d.counterparty_client_id) : null) ||
      d.counterparty_name_snapshot ||
      "";
    const entry = behaviourMap.get(key) ?? {
      name,
      days: [] as number[],
      total: 0,
    };
    entry.days.push(days);
    const inc = Number(d.total_inc_vat ?? 0);
    const ex = Number(d.subtotal_ex_vat ?? 0);
    entry.total += vatMode === "inc" ? inc : ex || inc;
    if (!entry.name && name) entry.name = name;
    behaviourMap.set(key, entry);
  }
  const behaviour: ClientPaymentBehaviour[] = Array.from(behaviourMap.entries())
    .map(([clientId, e]) => ({
      clientId,
      clientName: e.name,
      invoiceCount: e.days.length,
      avgDaysToPay: e.days.reduce((s, d) => s + d, 0) / e.days.length,
      medianDaysToPay: median(e.days),
      totalPaid: e.total,
    }))
    .sort((a, b) => b.avgDaysToPay - a.avgDaysToPay);

  // ---- Payables ------------------------------------------------------------
  const payables: PayableInvoice[] = raw.received.map((d: any) => {
    const categoryId =
      d.cost_category_id ?? (d.classification_id ? clsCategory.get(d.classification_id) : null) ?? null;
    const vendorId = d.counterparty_supplier_id ?? null;
    const ref = d.due_date;
    const daysOverdue = ref ? Math.max(0, daysBetween(ref, today)) : 0;
    return {
      id: d.id,
      vendorId,
      vendorName:
        (vendorId ? companyName.get(vendorId) : null) ||
        d.counterparty_name_snapshot ||
        "",
      documentNumber: d.document_number ?? null,
      categoryId,
      categoryName: categoryId ? (categoryName.get(categoryId) ?? null) : null,
      amount: amountOf(d, vatMode),
      issueDate: d.issue_date ?? null,
      dueDate: d.due_date ?? null,
      daysOverdue,
    };
  });
  payables.sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount);

  const payablesTotal = payables.reduce((s, r) => s + r.amount, 0);
  const payablesOverdue = payables
    .filter((r) => r.daysOverdue > 0)
    .reduce((s, r) => s + r.amount, 0);

  const vendorMap = new Map<string, PayableVendor>();
  for (const p of payables) {
    const key = p.vendorId ?? (p.vendorName || UNKNOWN);
    const v = vendorMap.get(key) ?? {
      vendorId: key,
      vendorName: p.vendorName,
      amount: 0,
      count: 0,
      share: 0,
      overdue: 0,
    };
    v.amount += p.amount;
    v.count += 1;
    if (p.daysOverdue > 0) v.overdue += p.amount;
    if (!v.vendorName && p.vendorName) v.vendorName = p.vendorName;
    vendorMap.set(key, v);
  }
  const vendors = Array.from(vendorMap.values())
    .map((v) => ({
      ...v,
      share: payablesTotal > 0 ? v.amount / payablesTotal : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    outstanding,
    outstandingTotal,
    overdueTotal,
    aging,
    behaviour,
    payables,
    payablesTotal,
    payablesOverdue,
    vendors,
  };
}

export function useReceivablesPayables(vatMode: VatMode) {
  const { data, isLoading, error } = useReceivablesPayablesRaw();
  const report = useMemo(
    () => (data ? buildReceivablesPayables(data, vatMode) : null),
    [data, vatMode],
  );
  return { report, isLoading, error };
}

/**
 * Queryable per-client days-to-pay metric. Kept as its own hook so the
 * Forecast tab can weight projections by client payment behaviour later
 * without re-deriving it.
 */
export function useClientPaymentBehaviour(vatMode: VatMode = "inc") {
  const { report, isLoading, error } = useReceivablesPayables(vatMode);
  return { behaviour: report?.behaviour ?? [], isLoading, error };
}
