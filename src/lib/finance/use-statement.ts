/**
 * Shared statement engine — one query pattern for three entity types.
 *
 *   opening balance (everything dated before the range)
 *   + dated entries inside the range, in date order
 *   = running balance -> closing balance
 *
 * Bank accounts reuse `bank_account_calculated_balance()` (opening balance +
 * reconciled movements) so a statement can never drift from Bank balances.
 *
 * Clients/suppliers reuse the same tables that power Outstanding
 * Receivables/Payables on the Overview dashboard: `financial_documents`
 * (direction issued/received) plus `financial_document_payments`, on top of
 * the carried-over `companies.opening_balance_receivable/payable`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatementEntityType = "bank_account" | "client" | "supplier";

export type StatementEntry = {
  id: string;
  date: string;
  kind: "document" | "payment" | "transaction";
  reference: string;
  description: string;
  /** Signed movement applied to the running balance. */
  amount: number;
  running: number;
  /** Link target for documents (finance document detail). */
  documentId?: string | null;
};

export type Statement = {
  entityType: StatementEntityType;
  entityId: string;
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  entries: StatementEntry[];
  currency: string;
};

/** Day before an ISO date (yyyy-mm-dd). */
export function dayBefore(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function currentMonthRange(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0);
  const to = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  return { from, to };
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

async function bankStatement(
  accountId: string,
  from: string,
  to: string,
): Promise<Statement> {
  const [openingRes, txRes, accRes] = await Promise.all([
    supabase.rpc("bank_account_calculated_balance", {
      _account_id: accountId,
      _as_of: dayBefore(from),
    }),
    supabase
      .from("bank_transactions")
      .select("id, transaction_date, description, amount, currency, status")
      // "reconciled" is recorded by `reconciled_at`, exactly as
      // bank_calculated_balances() reads it.
      .not("reconciled_at", "is", null)
      .eq("bank_account_id", accountId)
      .gte("transaction_date", from)
      .lte("transaction_date", to)
      .order("transaction_date", { ascending: true }),
    supabase
      .from("bank_accounts")
      .select("currency, opening_balance_date")
      .eq("id", accountId)
      .maybeSingle(),
  ]);
  if (openingRes.error) throw openingRes.error;
  if (txRes.error) throw txRes.error;

  const opening = Number(openingRes.data ?? 0);
  let running = opening;
  let totalIn = 0;
  let totalOut = 0;

  // The balance function ignores movements on/before the opening-balance date.
  const openingDate = accRes.data?.opening_balance_date ?? null;

  const entries: StatementEntry[] = (txRes.data ?? [])
    .filter((tx) => !openingDate || tx.transaction_date > openingDate)
    .map((tx) => {
      const amount = Number(tx.amount ?? 0);
      running += amount;
      if (amount >= 0) totalIn += amount;
      else totalOut += -amount;
      return {
        id: tx.id,
        date: tx.transaction_date,
        kind: "transaction" as const,
        reference: "",
        description: tx.description ?? "",
        amount,
        running,
      };
    });


  return {
    entityType: "bank_account",
    entityId: accountId,
    from,
    to,
    openingBalance: opening,
    closingBalance: running,
    totalIn,
    totalOut,
    entries,
    currency: accRes.data?.currency ?? "EUR",
  };
}

// ---------------------------------------------------------------------------
// Clients / suppliers
// ---------------------------------------------------------------------------

type RawDoc = {
  id: string;
  document_number: string | null;
  external_reference: string | null;
  doc_type: string;
  issue_date: string;
  total_inc_vat: number | null;
  status: string;
};

async function companyStatement(
  entityType: "client" | "supplier",
  companyId: string,
  from: string,
  to: string,
): Promise<Statement> {
  const column =
    entityType === "client"
      ? "counterparty_client_id"
      : "counterparty_supplier_id";
  const direction = entityType === "client" ? "issued" : "received";

  const [companyRes, docsRes] = await Promise.all([
    supabase
      .from("companies")
      .select("opening_balance_receivable, opening_balance_payable, currency")
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("financial_documents")
      .select(
        "id, document_number, external_reference, doc_type, issue_date, total_inc_vat, status",
      )
      .eq(column, companyId)
      .eq("direction", direction)
      .neq("status", "cancelled")
      .lte("issue_date", to)
      .order("issue_date", { ascending: true }),
  ]);
  if (companyRes.error) throw companyRes.error;
  if (docsRes.error) throw docsRes.error;

  const docs = (docsRes.data ?? []) as RawDoc[];
  const docIds = docs.map((d) => d.id);

  let payments: {
    id: string;
    document_id: string;
    amount: number | null;
    payment_date: string;
    method: string | null;
  }[] = [];

  if (docIds.length > 0) {
    // Chunked to stay well inside URL length limits on large histories.
    const chunks: string[][] = [];
    for (let i = 0; i < docIds.length; i += 100)
      chunks.push(docIds.slice(i, i + 100));
    const results = await Promise.all(
      chunks.map((ids) =>
        supabase
          .from("financial_document_payments")
          .select("id, document_id, amount, payment_date, method")
          .in("document_id", ids)
          .lte("payment_date", to),
      ),
    );
    for (const r of results) {
      if (r.error) throw r.error;
      payments = payments.concat((r.data ?? []) as typeof payments);
    }
  }

  const carried = Number(
    (entityType === "client"
      ? companyRes.data?.opening_balance_receivable
      : companyRes.data?.opening_balance_payable) ?? 0,
  );

  const docsById = new Map(docs.map((d) => [d.id, d]));

  // Everything strictly before the range start folds into the opening balance.
  let opening = carried;
  for (const d of docs) {
    if (d.issue_date < from) opening += Number(d.total_inc_vat ?? 0);
  }
  for (const p of payments) {
    if (p.payment_date < from) opening -= Number(p.amount ?? 0);
  }

  type Row = Omit<StatementEntry, "running">;
  const rows: Row[] = [];

  for (const d of docs) {
    if (d.issue_date < from) continue;
    rows.push({
      id: `doc:${d.id}`,
      date: d.issue_date,
      kind: "document",
      reference: d.document_number ?? d.external_reference ?? "",
      description: d.doc_type,
      amount: Number(d.total_inc_vat ?? 0),
      documentId: d.id,
    });
  }
  for (const p of payments) {
    if (p.payment_date < from) continue;
    const doc = docsById.get(p.document_id);
    rows.push({
      id: `pay:${p.id}`,
      date: p.payment_date,
      kind: "payment",
      reference: doc?.document_number ?? doc?.external_reference ?? "",
      description: p.method ?? "",
      amount: -Number(p.amount ?? 0),
      documentId: p.document_id,
    });
  }

  rows.sort((a, b) =>
    a.date === b.date
      ? a.kind === b.kind
        ? 0
        : a.kind === "document"
          ? -1
          : 1
      : a.date < b.date
        ? -1
        : 1,
  );

  let running = opening;
  let totalIn = 0;
  let totalOut = 0;
  const entries: StatementEntry[] = rows.map((r) => {
    running += r.amount;
    if (r.amount >= 0) totalIn += r.amount;
    else totalOut += -r.amount;
    return { ...r, running };
  });

  return {
    entityType,
    entityId: companyId,
    from,
    to,
    openingBalance: opening,
    closingBalance: running,
    totalIn,
    totalOut,
    entries,
    currency: companyRes.data?.currency ?? "EUR",
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStatement(
  entityType: StatementEntityType,
  entityId: string | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ["finance", "statement", entityType, entityId, from, to],
    enabled: !!entityId && !!from && !!to,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<Statement> => {
      const id = entityId!;
      return entityType === "bank_account"
        ? bankStatement(id, from, to)
        : companyStatement(entityType, id, from, to);
    },
  });
}

// ---------------------------------------------------------------------------
// Entity pickers
// ---------------------------------------------------------------------------

export type StatementEntityOption = { id: string; label: string };

export function useStatementEntities(entityType: StatementEntityType) {
  return useQuery({
    queryKey: ["finance", "statement-entities", entityType],
    queryFn: async (): Promise<StatementEntityOption[]> => {
      if (entityType === "bank_account") {
        const { data, error } = await supabase
          .from("bank_accounts")
          .select("id, account_name, bank_name, archived_at")
          .order("account_name");
        if (error) throw error;
        return (data ?? [])
          .filter((a) => !a.archived_at)
          .map((a) => ({
            id: a.id,
            label: a.bank_name
              ? `${a.account_name} · ${a.bank_name}`
              : a.account_name,
          }));
      }
      const flag = entityType === "client" ? "is_client" : "is_supplier";
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome")
        .eq(flag, true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((c) => ({ id: c.id, label: c.nome }));
    },
    staleTime: 60_000,
  });
}
