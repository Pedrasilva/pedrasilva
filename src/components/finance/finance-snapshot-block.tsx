import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const fmtEURHome = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v || 0);

export function FinanceSnapshotBlock() {
  const { t } = useTranslation(["finance", "common"]);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const periodQ = useQuery({
    queryKey: ["home-finance", "period", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_periods")
        .select("id, opening_balance")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const periodId = periodQ.data?.id ?? null;

  const incomeQ = useQuery({
    queryKey: ["home-finance", "income", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      // Income source of truth: financial_documents (issued side).
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const end = new Date(Date.UTC(year, month, 0))
        .toISOString()
        .slice(0, 10);
      const { data, error } = await supabase
        .from("financial_documents")
        .select("total_inc_vat, subtotal_ex_vat, vat_amount")
        .eq("direction", "issued")
        .neq("status", "cancelled")
        .neq("status", "draft")
        .gte("issue_date", from)
        .lte("issue_date", end);
      if (error) throw error;
      return (data ?? []).reduce(
        (s, r) =>
          s +
          (r.total_inc_vat != null
            ? Number(r.total_inc_vat)
            : Number(r.subtotal_ex_vat || 0) + Number(r.vat_amount || 0)),
        0,
      );
    },
  });

  const expensesQ = useQuery({
    queryKey: ["home-finance", "expenses", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_expense_items")
        .select("amount_inc_vat, amount_ex_vat, vat_amount")
        .eq("period_id", periodId!);
      if (error) throw error;
      return (data ?? []).reduce(
        (s, r) =>
          s +
          (r.amount_inc_vat != null
            ? Number(r.amount_inc_vat)
            : Number(r.amount_ex_vat || 0) + Number(r.vat_amount || 0)),
        0,
      );
    },
  });

  const debtsQ = useQuery({
    queryKey: ["home-finance", "debts", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_debt_payments")
        .select("planned_amount, actual_amount")
        .eq("period_id", periodId!);
      if (error) throw error;
      return (data ?? []).reduce(
        (s, r) => s + Number(r.actual_amount ?? r.planned_amount ?? 0),
        0,
      );
    },
  });

  // Same shared calculation as Bank balances / Finance overview:
  // opening balance + every reconciled transaction.
  const balancesQ = useQuery({
    queryKey: ["home-finance", "calculated-balances"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bank_calculated_balances", {});
      if (error) throw error;
      return (data ?? []).reduce(
        (s: number, r: { calculated_balance: number | string }) =>
          s + Number(r.calculated_balance ?? 0),
        0,
      );
    },
  });

  if (periodQ.isLoading) return null;
  if (!periodId) {
    return (
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4" style={{ color: "var(--clay)" }} />
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("finance:home.kicker")}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("finance:home.noPeriod")}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const currentBalance = balancesQ.data ?? 0;
  const income = incomeQ.data ?? 0;
  const expenses = (expensesQ.data ?? 0) + (debtsQ.data ?? 0);
  const net = income - expenses;
  const projected = currentBalance + net;

  const statusKey =
    net > 0 ? "positive" : net < 0 ? "negative" : "flat";
  const statusTone =
    net > 0
      ? "text-emerald-600"
      : net < 0
        ? "text-rose-600"
        : "text-muted-foreground";
  const StatusIcon = net >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4" style={{ color: "var(--clay)" }} />
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("finance:home.kicker")}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <KpiMini
              label={t("finance:home.currentBalance")}
              value={fmtEURHome(currentBalance)}
            />
            <KpiMini
              label={t("finance:home.expectedIncome")}
              value={fmtEURHome(income)}
              tone="text-emerald-700"
            />
            <KpiMini
              label={t("finance:home.expectedExpenses")}
              value={fmtEURHome(expenses)}
              tone="text-rose-700"
            />
            <KpiMini
              label={t("finance:home.projectedClosing")}
              value={fmtEURHome(projected)}
            />
          </div>
          <div className={cn("flex items-center gap-2 text-sm", statusTone)}>
            <StatusIcon className="h-4 w-4" />
            <span>{t(`finance:home.status.${statusKey}`)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function KpiMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-lg tabular-nums",
          tone ?? "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

