/**
 * OperationalOverview — Finance Overview cards driven by ACTUAL operational
 * data (financial_documents, financial_document_payments, bank_balance_snapshots),
 * not from `financial_periods` projections.
 *
 * The legacy projection-based cashflow report at /finance/reports/cashflow
 * is kept untouched.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Wallet,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  KpiCard,
  fmtEUR,
  latestSnapshotByAccount,
  type BankSnapshot,
} from "@/components/finance/sections/legacy-sections";

// ---------------------------------------------------------------------------
// Types — narrow projections of canonical tables
// ---------------------------------------------------------------------------

type DocRow = {
  id: string;
  direction: "issued" | "received";
  status: string;
  outstanding_amount: number | null;
  total_inc_vat: number | null;
  due_date: string | null;
  document_number: string | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  payment_date: string;
  document_id: string;
  document: { direction: "issued" | "received" } | null;
};

type ActiveAccount = { id: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthBounds(d = new Date()): { start: string; end: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

const QA_SEED_NUMBERS = new Set(["QA-PUR-001", "QA-INV-001"]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OperationalOverview() {
  const { t } = useTranslation(["finance", "common"]);
  const { start: monthStart, end: monthEnd } = monthBounds();
  const today = new Date().toISOString().slice(0, 10);

  const accountsQ = useQuery({
    queryKey: ["finance", "overview", "active-accounts"],
    queryFn: async (): Promise<ActiveAccount[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as ActiveAccount[];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const snapshotsQ = useQuery({
    queryKey: ["finance", "overview", "bank-snapshots"],
    queryFn: async (): Promise<BankSnapshot[]> => {
      const { data, error } = await supabase
        .from("bank_balance_snapshots")
        .select("id, bank_account_id, snapshot_date, balance")
        .order("snapshot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankSnapshot[];
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const openDocsQ = useQuery({
    queryKey: ["finance", "overview", "open-docs"],
    queryFn: async (): Promise<DocRow[]> => {
      const { data, error } = await supabase
        .from("financial_documents")
        .select(
          "id, direction, status, outstanding_amount, total_inc_vat, due_date, document_number",
        )
        .neq("status", "cancelled")
        .gt("outstanding_amount", 0);
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const monthPaymentsQ = useQuery({
    queryKey: ["finance", "overview", "month-payments", monthStart, monthEnd],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from("financial_document_payments")
        .select(
          "id, amount, payment_date, document_id, document:financial_documents(direction)",
        )
        .gte("payment_date", monthStart)
        .lte("payment_date", monthEnd);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  // QA seed presence — informational only.
  const qaSeedQ = useQuery({
    queryKey: ["finance", "overview", "qa-seed-check"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("financial_documents")
        .select("id", { count: "exact", head: true })
        .in("document_number", Array.from(QA_SEED_NUMBERS));
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const loading =
    accountsQ.isLoading ||
    snapshotsQ.isLoading ||
    openDocsQ.isLoading ||
    monthPaymentsQ.isLoading;

  const summary = useMemo(() => {
    const activeIds = new Set((accountsQ.data ?? []).map((a) => a.id));
    const latest = latestSnapshotByAccount(snapshotsQ.data ?? []);
    let bankBalance = 0;
    for (const [accId, snap] of latest.entries()) {
      if (activeIds.has(accId)) bankBalance += Number(snap.balance || 0);
    }

    const docs = openDocsQ.data ?? [];
    const receivables = docs.filter((d) => d.direction === "issued");
    const payables = docs.filter((d) => d.direction === "received");

    const sum = (rows: DocRow[]) =>
      rows.reduce((s, r) => s + Number(r.outstanding_amount ?? 0), 0);

    const overdue = (rows: DocRow[]) =>
      rows.filter((r) => r.due_date != null && r.due_date < today);

    const dueThisMonth = (rows: DocRow[]) =>
      rows.filter(
        (r) =>
          r.due_date != null && r.due_date >= monthStart && r.due_date <= monthEnd,
      );

    const recvOverdue = overdue(receivables);
    const payOverdue = overdue(payables);
    const recvDueMonth = dueThisMonth(receivables);
    const payDueMonth = dueThisMonth(payables);

    const payments = monthPaymentsQ.data ?? [];
    let moneyIn = 0;
    let moneyOut = 0;
    for (const p of payments) {
      const amt = Number(p.amount || 0);
      if (p.document?.direction === "issued") moneyIn += amt;
      else if (p.document?.direction === "received") moneyOut += amt;
    }
    const netActual = moneyIn - moneyOut;

    const forecast = bankBalance + sum(recvDueMonth) - sum(payDueMonth);

    return {
      bankBalance,
      receivablesAmount: sum(receivables),
      receivablesCount: receivables.length,
      receivablesOverdueAmount: sum(recvOverdue),
      receivablesOverdueCount: recvOverdue.length,
      payablesAmount: sum(payables),
      payablesCount: payables.length,
      payablesOverdueAmount: sum(payOverdue),
      payablesOverdueCount: payOverdue.length,
      moneyIn,
      moneyOut,
      netActual,
      forecast,
    };
  }, [
    accountsQ.data,
    snapshotsQ.data,
    openDocsQ.data,
    monthPaymentsQ.data,
    today,
    monthStart,
    monthEnd,
  ]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
    );
  }

  const hasQaSeed = (qaSeedQ.data ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {t("finance:overview.operationalTitle")}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {t("finance:overview.operationalSub")}
        </p>
      </div>

      {/* Row 1: balances + outstanding */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label={t("finance:overview.currentBankBalance")}
          sub={t("finance:overview.currentBankBalanceSub")}
          value={fmtEUR(summary.bankBalance)}
          tone="neutral"
        />
        <KpiCard
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label={t("finance:overview.outstandingReceivables")}
          sub={`${t("finance:overview.countDocuments", { count: summary.receivablesCount })} · ${t("finance:overview.overdueAmount")}: ${fmtEUR(summary.receivablesOverdueAmount)} (${summary.receivablesOverdueCount})`}
          value={fmtEUR(summary.receivablesAmount)}
          tone={summary.receivablesOverdueCount > 0 ? "negative" : "positive"}
        />
        <KpiCard
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label={t("finance:overview.outstandingPayables")}
          sub={`${t("finance:overview.countDocuments", { count: summary.payablesCount })} · ${t("finance:overview.overdueAmount")}: ${fmtEUR(summary.payablesOverdueAmount)} (${summary.payablesOverdueCount})`}
          value={fmtEUR(summary.payablesAmount)}
          tone={summary.payablesOverdueCount > 0 ? "negative" : "neutral"}
        />
        <KpiCard
          icon={<Sparkles className="h-4 w-4" />}
          label={t("finance:overview.simpleForecast")}
          sub={t("finance:overview.simpleForecastSub")}
          value={fmtEUR(summary.forecast)}
          tone={summary.forecast >= summary.bankBalance ? "positive" : "negative"}
        />
      </div>

      {/* Row 2: this-month activity */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("finance:overview.moneyInThisMonth")}
          sub={t("finance:overview.moneyInSub")}
          value={fmtEUR(summary.moneyIn)}
          tone="positive"
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label={t("finance:overview.moneyOutThisMonth")}
          sub={t("finance:overview.moneyOutSub")}
          value={fmtEUR(summary.moneyOut)}
          tone="negative"
        />
        <KpiCard
          icon={<CircleDollarSign className="h-4 w-4" />}
          label={t("finance:overview.netActualCashMovement")}
          value={fmtEUR(summary.netActual)}
          tone={summary.netActual >= 0 ? "positive" : "negative"}
        />
      </div>

      {hasQaSeed ? (
        <Card className="border-dashed border-amber-400/60">
          <CardContent className="p-3 flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-600" />
            <span>{t("finance:overview.qaSeedNotice")}</span>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
