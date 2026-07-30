/**
 * Income reporting source of truth.
 *
 * financial_documents (direction = 'issued') replaces financial_income_items
 * for every income report: home dashboard finance card, finance overview KPIs,
 * cash flow and the Income section.
 *
 * financial_income_items and its Excel importer stay in place but are no
 * longer read by the app.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Statuses used by the legacy income reports. */
export type IncomeReportStatus =
  | "planned"
  | "issued"
  | "paid"
  | "overdue"
  | "cancelled";

export type IncomeDocRow = {
  id: string;
  period_id: string | null;
  client_id: string | null;
  project_id: string | null;
  project_name: string | null;
  project_code: string | null;
  counterparty_name: string | null;
  invoice_number: string | null;
  invoice_status: IncomeReportStatus;
  issue_date: string;
  expected_payment_date: string | null;
  paid_date: string | null;
  amount_ex_vat: number;
  vat_amount: number | null;
  amount_inc_vat: number | null;
  vat_rate: number;
};

/** Maps a financial_documents.status to the income report status vocabulary. */
export function mapDocStatus(
  status: string,
  dueDate: string | null,
  outstanding: number,
): IncomeReportStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "paid") return "paid";
  if (status === "draft") return "planned";
  // issued / partially_paid
  if (dueDate && outstanding > 0) {
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate < today) return "overdue";
  }
  return "issued";
}

type PeriodLite = { id: string; month: number };

async function fetchPeriodMap(year: number) {
  const { data, error } = await supabase
    .from("financial_periods")
    .select("id, month")
    .eq("year", year);
  if (error) throw error;
  const m = new Map<number, string>();
  for (const p of (data ?? []) as PeriodLite[]) m.set(p.month, p.id);
  return m;
}

function periodIdFor(
  map: Map<number, string>,
  issueDate: string,
  year: number,
): string | null {
  if (!issueDate) return null;
  const y = Number(issueDate.slice(0, 4));
  if (y !== year) return null;
  const month = Number(issueDate.slice(5, 7));
  return map.get(month) ?? null;
}

/**
 * Full income rows for the Income section (client-side, per year).
 */
export function useIncomeDocuments(year: number) {
  return useQuery({
    queryKey: ["finance", "income-documents", year],
    queryFn: async (): Promise<IncomeDocRow[]> => {
      const periodMap = await fetchPeriodMap(year);

      const { data, error } = await supabase
        .from("financial_documents")
        .select(
          `id, status, document_number, external_reference, issue_date, due_date,
           counterparty_client_id, counterparty_name_snapshot, project_id,
           subtotal_ex_vat, vat_amount, total_inc_vat, paid_amount, outstanding_amount,
           pm_projects:project_id ( name, code )`,
        )
        .eq("direction", "issued")
        .gte("issue_date", `${year}-01-01`)
        .lte("issue_date", `${year}-12-31`)
        .order("issue_date", { ascending: true });
      if (error) throw error;

      const docs = (data ?? []) as any[];
      const ids = docs.map((d) => d.id);

      // Latest payment date per document (used as "paid on").
      const paidMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: pays, error: payErr } = await supabase
          .from("financial_document_payments")
          .select("document_id, payment_date")
          .in("document_id", ids);
        if (payErr) throw payErr;
        for (const p of pays ?? []) {
          const prev = paidMap.get(p.document_id);
          if (!prev || (p.payment_date && p.payment_date > prev)) {
            paidMap.set(p.document_id, p.payment_date as string);
          }
        }
      }

      return docs.map((d) => {
        const ex = Number(d.subtotal_ex_vat ?? 0);
        const vat = Number(d.vat_amount ?? 0);
        const inc = Number(d.total_inc_vat ?? ex + vat);
        const outstanding = Number(
          d.outstanding_amount ?? inc - Number(d.paid_amount ?? 0),
        );
        return {
          id: d.id,
          period_id: periodIdFor(periodMap, d.issue_date, year),
          client_id: d.counterparty_client_id ?? null,
          project_id: d.project_id ?? null,
          project_name: d.pm_projects?.name ?? null,
          project_code: d.pm_projects?.code ?? null,
          counterparty_name: d.counterparty_name_snapshot ?? null,
          invoice_number: d.document_number ?? d.external_reference ?? null,
          invoice_status: mapDocStatus(d.status, d.due_date ?? null, outstanding),
          issue_date: d.issue_date,
          expected_payment_date: d.due_date ?? null,
          paid_date: paidMap.get(d.id) ?? null,
          amount_ex_vat: ex,
          vat_amount: vat,
          amount_inc_vat: inc,
          vat_rate: ex > 0 ? Math.round((vat / ex) * 100) : 0,
        } satisfies IncomeDocRow;
      });
    },
  });
}
