/**
 * Cash flow report data (receivables + cost categories).
 *
 * Receivables are grouped Client > Project, each month split into three
 * segments: received (reconciled payments), issued (invoiced, unpaid) and
 * future (retainer / payment-schedule forecast, not yet invoiced).
 *
 * Costs are grouped by cost_categories: actuals from classified received
 * documents / expense records, future months from recurring carry-forward
 * plus consultant payment milestones from approved project schedules.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CASHFLOW_YEAR = 2026;

export type VatMode = "inc" | "ex";

export type CostCategory = {
  id: string;
  name: string;
  slug: string | null;
  is_default: boolean;
  sort_order: number;
  active: boolean;
};

export type MonthCell = { received: number; issued: number; future: number };

export type ReceivableRow = {
  key: string;
  label: string;
  kind: "client" | "project";
  months: MonthCell[];
  outstanding: number;
  children?: ReceivableRow[];
};

export type CostRow = {
  key: string;
  label: string;
  categoryId: string | null;
  isDefault: boolean;
  actual: number[];
  forecast: number[];
};

export type MonthMeta = {
  year: number;
  month: number;
  label: string;
  isFuture: boolean;
};

export type CashFlowReport = {
  months: MonthMeta[];
  clients: ReceivableRow[];
  segmentTotals: { received: number[]; issued: number[]; future: number[] };
  costs: CostRow[];
  costTotals: number[];
  opening: number[];
  net: number[];
  closing: number[];
  totalOutstanding: number;
};

const zeros = () => Array.from({ length: 12 }, () => 0);
const emptyCells = (): MonthCell[] =>
  Array.from({ length: 12 }, () => ({ received: 0, issued: 0, future: 0 }));

function monthIndex(dateStr: string | null | undefined, year: number) {
  if (!dateStr) return -1;
  const y = Number(dateStr.slice(0, 4));
  if (y !== year) return -1;
  const m = Number(dateStr.slice(5, 7));
  return m >= 1 && m <= 12 ? m - 1 : -1;
}

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-PT", {
    month: "short",
    timeZone: "UTC",
  });
}

function vatFactor(ex: number, inc: number, mode: VatMode) {
  if (mode === "inc") return 1;
  if (!inc) return 1;
  return ex / inc;
}

// ---------------------------------------------------------------------------
// Raw fetches
// ---------------------------------------------------------------------------

export function useCostCategories() {
  return useQuery({
    queryKey: ["finance", "cost-categories"],
    queryFn: async (): Promise<CostCategory[]> => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("id, name, slug, is_default, sort_order, active")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CostCategory[];
    },
  });
}

type RawData = {
  categories: CostCategory[];
  issuedDocs: any[];
  receivedDocs: any[];
  payments: any[];
  classifications: { id: string; code: string; cost_category_id: string | null }[];
  projects: { id: string; name: string; company_id: string | null }[];
  companies: { id: string; nome: string | null }[];
  retainers: any[];
  inflowSchedule: any[];
  outflowSchedule: any[];
  periods: { id: string; month: number; opening_balance: number; status: string }[];
  companyExpenses: any[];
};

function useCashFlowRaw(year: number) {
  return useQuery({
    queryKey: ["finance", "cashflow-report-raw", year],
    queryFn: async (): Promise<RawData> => {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;

      const [
        cats,
        issued,
        received,
        cls,
        projects,
        retainers,
        schedule,
        periods,
        companyExpenses,
      ] = await Promise.all([
        supabase
          .from("cost_categories")
          .select("id, name, slug, is_default, sort_order, active")
          .order("sort_order"),
        supabase
          .from("financial_documents")
          .select(
            `id, status, issue_date, due_date, counterparty_client_id,
             counterparty_name_snapshot, project_id, subtotal_ex_vat, vat_amount,
             total_inc_vat, paid_amount, outstanding_amount`,
          )
          .eq("direction", "issued")
          .neq("status", "cancelled")
          .gte("issue_date", from)
          .lte("issue_date", to),
        supabase
          .from("financial_documents")
          .select(
            `id, issue_date, classification_id, cost_category_id,
             subtotal_ex_vat, vat_amount, total_inc_vat`,
          )
          .eq("direction", "received")
          .neq("status", "cancelled")
          .gte("issue_date", from)
          .lte("issue_date", to),
        supabase
          .from("financial_classifications")
          .select("id, code, cost_category_id"),
        supabase.from("pm_projects").select("id, name, company_id"),
        supabase
          .from("pm_stages")
          .select("project_id, start_date, budget, retainer_monthly_amount")
          .eq("stage_kind", "retainer_month"),
        supabase
          .from("quote_payment_schedule_items")
          .select(
            `expected_invoice_date, expected_payment_date, amount_value, direction,
             quote:fee_proposals!inner(quote_status, pm_project_id),
             stage:quote_stages(stage_kind)`,
          ),
        supabase
          .from("financial_periods")
          .select("id, month, opening_balance, status")
          .eq("year", year)
          .order("month"),
        supabase
          .from("company_expenses")
          .select("id, amount, incurred_at, paid_at, cost_category_id")
          .gte("incurred_at", from)
          .lte("incurred_at", to),
      ]);

      for (const r of [
        cats,
        issued,
        received,
        cls,
        projects,
        retainers,
        schedule,
        periods,
        companyExpenses,
      ]) {
        if (r.error) throw r.error;
      }

      const docIds = (issued.data ?? []).map((d: any) => d.id);
      let payments: any[] = [];
      if (docIds.length > 0) {
        const { data, error } = await supabase
          .from("financial_document_payments")
          .select("document_id, payment_date, amount")
          .in("document_id", docIds);
        if (error) throw error;
        payments = data ?? [];
      }

      const companyIds = Array.from(
        new Set(
          [
            ...(issued.data ?? []).map((d: any) => d.counterparty_client_id),
            ...(projects.data ?? []).map((p: any) => p.company_id),
          ].filter(Boolean),
        ),
      ) as string[];
      let companies: any[] = [];
      if (companyIds.length > 0) {
        const { data, error } = await supabase
          .from("companies")
          .select("id, nome")
          .in("id", companyIds);
        if (error) throw error;
        companies = data ?? [];
      }

      const sched = (schedule.data ?? []) as any[];
      return {
        categories: (cats.data ?? []) as CostCategory[],
        issuedDocs: issued.data ?? [],
        receivedDocs: received.data ?? [],
        payments,
        classifications: (cls.data ?? []) as any[],
        projects: (projects.data ?? []) as any[],
        companies,
        retainers: retainers.data ?? [],
        inflowSchedule: sched.filter(
          (r) => r.direction == null || r.direction === "inflow",
        ),
        outflowSchedule: sched.filter((r) => r.direction === "outflow"),
        periods: (periods.data ?? []) as any[],
        companyExpenses: companyExpenses.data ?? [],
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildCashFlowReport(
  raw: RawData,
  vatMode: VatMode,
  year: number,
  now = new Date(),
): CashFlowReport {
  const currentIdx =
    now.getFullYear() > year
      ? 12
      : now.getFullYear() < year
        ? -1
        : now.getMonth();

  const months: MonthMeta[] = Array.from({ length: 12 }, (_, i) => ({
    year,
    month: i + 1,
    label: monthLabel(year, i + 1),
    isFuture: i > currentIdx,
  }));

  const projectById = new Map(raw.projects.map((p) => [p.id, p]));
  const companyName = new Map(
    raw.companies.map((c) => [c.id, c.nome ?? ""]),
  );

  const UNASSIGNED = "__unassigned__";
  const NO_PROJECT = "__noproject__";

  type Bucket = {
    key: string;
    label: string;
    months: MonthCell[];
    outstanding: number;
    projects: Map<string, { label: string; months: MonthCell[]; outstanding: number }>;
  };
  const clients = new Map<string, Bucket>();

  const clientBucket = (id: string | null, label: string): Bucket => {
    const key = id ?? UNASSIGNED;
    let b = clients.get(key);
    if (!b) {
      b = {
        key,
        label: label || key === UNASSIGNED ? label : label,
        months: emptyCells(),
        outstanding: 0,
        projects: new Map(),
      };
      clients.set(key, b);
    }
    if (label && (!b.label || b.label === UNASSIGNED)) b.label = label;
    return b;
  };

  const projBucket = (b: Bucket, projectId: string | null, label: string) => {
    const key = projectId ?? NO_PROJECT;
    let p = b.projects.get(key);
    if (!p) {
      p = { label, months: emptyCells(), outstanding: 0 };
      b.projects.set(key, p);
    }
    if (label && !p.label) p.label = label;
    return p;
  };

  const add = (
    b: Bucket,
    projectId: string | null,
    projectLabel: string,
    idx: number,
    seg: keyof MonthCell,
    amount: number,
  ) => {
    if (idx < 0 || idx > 11 || !amount) return;
    b.months[idx][seg] += amount;
    const p = projBucket(b, projectId, projectLabel);
    p.months[idx][seg] += amount;
  };

  // --- Issued invoices: received (payments) + issued (outstanding) ---
  const paymentsByDoc = new Map<string, any[]>();
  for (const p of raw.payments) {
    const list = paymentsByDoc.get(p.document_id) ?? [];
    list.push(p);
    paymentsByDoc.set(p.document_id, list);
  }

  const todayStr = now.toISOString().slice(0, 10);

  for (const d of raw.issuedDocs) {
    const ex = Number(d.subtotal_ex_vat ?? 0);
    const vat = Number(d.vat_amount ?? 0);
    const inc = Number(d.total_inc_vat ?? ex + vat);
    const f = vatFactor(ex, inc, vatMode);

    const project = d.project_id ? projectById.get(d.project_id) : null;
    const clientId =
      d.counterparty_client_id ?? project?.company_id ?? null;
    const label =
      d.counterparty_name_snapshot ??
      (clientId ? (companyName.get(clientId) ?? "") : "");
    const bucket = clientBucket(clientId, label);
    const projectLabel = project?.name ?? "";

    const docPayments = paymentsByDoc.get(d.id) ?? [];
    let receivedTotal = 0;
    for (const p of docPayments) {
      const amount = Number(p.amount ?? 0) * f;
      receivedTotal += amount;
      add(
        bucket,
        d.project_id ?? null,
        projectLabel,
        monthIndex(p.payment_date, year),
        "received",
        amount,
      );
    }
    // Documents marked paid without payment rows still count as received.
    const paidAmount = Number(d.paid_amount ?? 0) * f;
    if (paidAmount > receivedTotal + 0.01) {
      add(
        bucket,
        d.project_id ?? null,
        projectLabel,
        monthIndex(d.issue_date, year),
        "received",
        paidAmount - receivedTotal,
      );
      receivedTotal = paidAmount;
    }

    const outstanding = Math.max(
      0,
      Number(d.outstanding_amount ?? inc - Number(d.paid_amount ?? 0)) * f,
    );
    if (outstanding > 0.01) {
      const when = d.due_date ?? d.issue_date;
      add(
        bucket,
        d.project_id ?? null,
        projectLabel,
        monthIndex(when, year),
        "issued",
        outstanding,
      );
      const overdue = (d.due_date ?? d.issue_date) < todayStr;
      if (overdue) {
        bucket.outstanding += outstanding;
        projBucket(bucket, d.project_id ?? null, projectLabel).outstanding +=
          outstanding;
      }
    }
  }

  // --- Future receivables: retainers + approved payment schedules ---
  const pushFuture = (
    projectId: string | null,
    dateStr: string | null,
    amount: number,
  ) => {
    const idx = monthIndex(dateStr, year);
    if (idx < 0 || idx <= currentIdx || !amount) return;
    const project = projectId ? projectById.get(projectId) : null;
    const clientId = project?.company_id ?? null;
    const bucket = clientBucket(
      clientId,
      clientId ? (companyName.get(clientId) ?? "") : "",
    );
    add(bucket, projectId, project?.name ?? "", idx, "future", amount);
  };

  for (const s of raw.retainers) {
    const amount =
      Number(s.retainer_monthly_amount ?? 0) || Number(s.budget ?? 0);
    pushFuture(s.project_id ?? null, s.start_date ?? null, amount);
  }
  for (const r of raw.inflowSchedule) {
    if (r.quote?.quote_status !== "approved") continue;
    if (!r.quote?.pm_project_id) continue;
    const kind = r.stage?.stage_kind ?? null;
    if (kind === "retainer_month" || kind === "retainer_monthly") continue;
    pushFuture(
      r.quote.pm_project_id,
      r.expected_invoice_date ?? null,
      Number(r.amount_value ?? 0),
    );
  }

  const clientRows: ReceivableRow[] = Array.from(clients.values())
    .map((b) => ({
      key: b.key,
      label: b.label,
      kind: "client" as const,
      months: b.months,
      outstanding: b.outstanding,
      children: Array.from(b.projects.entries()).map(([k, p]) => ({
        key: `${b.key}:${k}`,
        label: p.label,
        kind: "project" as const,
        months: p.months,
        outstanding: p.outstanding,
      })),
    }))
    .filter((r) =>
      r.months.some((m) => m.received || m.issued || m.future),
    )
    .sort((a, b) => {
      const sum = (r: ReceivableRow) =>
        r.months.reduce((s, m) => s + m.received + m.issued + m.future, 0);
      return sum(b) - sum(a);
    });

  const segmentTotals = {
    received: zeros(),
    issued: zeros(),
    future: zeros(),
  };
  for (const r of clientRows) {
    r.months.forEach((m, i) => {
      segmentTotals.received[i] += m.received;
      segmentTotals.issued[i] += m.issued;
      segmentTotals.future[i] += m.future;
    });
  }

  // --- Costs ---
  const categories = raw.categories
    .filter((c) => c.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const other =
    categories.find((c) => c.slug === "other_operating") ?? categories[0];
  const consultants =
    categories.find((c) => c.slug === "consultants_suppliers") ?? other;

  const clsById = new Map(raw.classifications.map((c) => [c.id, c]));
  const costActual = new Map<string, number[]>();
  const costForecast = new Map<string, number[]>();
  for (const c of categories) {
    costActual.set(c.id, zeros());
    costForecast.set(c.id, zeros());
  }
  const bump = (
    map: Map<string, number[]>,
    catId: string | null | undefined,
    idx: number,
    amount: number,
  ) => {
    if (idx < 0 || idx > 11 || !amount) return;
    const id = catId && map.has(catId) ? catId : other?.id;
    if (!id) return;
    const arr = map.get(id);
    if (arr) arr[idx] += amount;
  };

  for (const d of raw.receivedDocs) {
    const cls = d.classification_id ? clsById.get(d.classification_id) : null;
    // Transfers and income-coded rows are not operating costs.
    if (cls && (cls.code.startsWith("TRF") || cls.code.startsWith("INC"))) {
      continue;
    }
    const ex = Number(d.subtotal_ex_vat ?? 0);
    const vat = Number(d.vat_amount ?? 0);
    const inc = Number(d.total_inc_vat ?? ex + vat);
    const amount = vatMode === "inc" ? inc : ex;
    const catId = d.cost_category_id ?? cls?.cost_category_id ?? other?.id;
    bump(costActual, catId, monthIndex(d.issue_date, year), amount);
  }

  for (const e of raw.companyExpenses) {
    bump(
      costActual,
      e.cost_category_id ?? other?.id,
      monthIndex(e.incurred_at, year),
      Number(e.amount ?? 0),
    );
  }

  // Recurring carry-forward: a category that appeared in at least two of the
  // three most recent months with actuals keeps its latest monthly amount.
  for (const c of categories) {
    const arr = costActual.get(c.id) ?? zeros();
    const lastIdx = Math.min(currentIdx, 11);
    if (lastIdx < 0) continue;
    const window: number[] = [];
    for (let i = Math.max(0, lastIdx - 2); i <= lastIdx; i++) window.push(arr[i]);
    const withData = window.filter((v) => v > 0);
    if (withData.length < 2) continue;
    const baseline = withData.reduce((s, v) => s + v, 0) / withData.length;
    const fc = costForecast.get(c.id) ?? zeros();
    for (let i = lastIdx + 1; i < 12; i++) fc[i] += baseline;
  }

  // Consultant payment milestones from approved project schedules.
  for (const r of raw.outflowSchedule) {
    if (r.quote?.quote_status !== "approved") continue;
    if (!r.quote?.pm_project_id) continue;
    const when = r.expected_payment_date ?? r.expected_invoice_date ?? null;
    const idx = monthIndex(when, year);
    if (idx <= currentIdx) continue;
    bump(costForecast, consultants?.id, idx, Number(r.amount_value ?? 0));
  }

  const costs: CostRow[] = categories.map((c) => ({
    key: c.id,
    label: c.name,
    categoryId: c.id,
    isDefault: c.is_default,
    actual: costActual.get(c.id) ?? zeros(),
    forecast: costForecast.get(c.id) ?? zeros(),
  }));

  const costTotals = zeros();
  for (const row of costs) {
    for (let i = 0; i < 12; i++) {
      costTotals[i] += months[i].isFuture ? row.forecast[i] : row.actual[i];
    }
  }

  // --- Net & closing ---
  const opening = zeros();
  const net = zeros();
  const closing = zeros();
  const periodByMonth = new Map(raw.periods.map((p) => [p.month, p]));
  let running: number | null = null;
  for (let i = 0; i < 12; i++) {
    const seed = Number(periodByMonth.get(i + 1)?.opening_balance ?? 0);
    const open = running == null ? seed : running || seed;
    const inflow = months[i].isFuture
      ? segmentTotals.issued[i] + segmentTotals.future[i]
      : segmentTotals.received[i];
    net[i] = inflow - costTotals[i];
    opening[i] = open;
    closing[i] = open + net[i];
    running = closing[i];
  }

  return {
    months,
    clients: clientRows,
    segmentTotals,
    costs,
    costTotals,
    opening,
    net,
    closing,
    totalOutstanding: clientRows.reduce((s, r) => s + r.outstanding, 0),
  };
}

export function useCashFlowReport(vatMode: VatMode, year = CASHFLOW_YEAR) {
  const rawQ = useCashFlowRaw(year);
  const report = rawQ.data
    ? buildCashFlowReport(rawQ.data, vatMode, year)
    : null;
  return { report, isLoading: rawQ.isLoading, error: rawQ.error };
}
