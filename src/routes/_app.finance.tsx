import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowDownToLine,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/finance")({
  component: FinanceDashboardPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = {
  id: string;
  year: number;
  month: number;
  month_name: string;
  status: string;
  opening_balance: number;
  closing_balance: number;
};

type IncomeRow = {
  id: string;
  period_id: string | null;
  amount_ex_vat: number;
  vat_amount: number | null;
  amount_inc_vat: number | null;
  invoice_status: string;
  expected_payment_date: string | null;
  paid_date: string | null;
};

type ExpenseRow = {
  id: string;
  period_id: string | null;
  amount_ex_vat: number;
  vat_amount: number | null;
  amount_inc_vat: number | null;
  expense_type: string;
  status: string;
};

type DebtPayment = {
  id: string;
  period_id: string | null;
  planned_amount: number;
  actual_amount: number | null;
  status: string;
};

type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string | null;
  currency: string;
  is_active: boolean;
};

type BankSnapshot = {
  id: string;
  bank_account_id: string;
  snapshot_date: string;
  balance: number;
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const FINANCE_YEAR = 2026;

function useFinanceData() {
  const periodsQ = useQuery({
    queryKey: ["finance", "periods", FINANCE_YEAR],
    queryFn: async (): Promise<Period[]> => {
      const { data, error } = await supabase
        .from("financial_periods")
        .select(
          "id, year, month, month_name, status, opening_balance, closing_balance",
        )
        .eq("year", FINANCE_YEAR)
        .order("month");
      if (error) throw error;
      return (data ?? []) as Period[];
    },
  });

  const incomeQ = useQuery({
    queryKey: ["finance", "income", FINANCE_YEAR],
    queryFn: async (): Promise<IncomeRow[]> => {
      const { data, error } = await supabase
        .from("financial_income_items")
        .select(
          "id, period_id, amount_ex_vat, vat_amount, amount_inc_vat, invoice_status, expected_payment_date, paid_date",
        );
      if (error) throw error;
      return (data ?? []) as IncomeRow[];
    },
  });

  const expensesQ = useQuery({
    queryKey: ["finance", "expenses", FINANCE_YEAR],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from("financial_expense_items")
        .select(
          "id, period_id, amount_ex_vat, vat_amount, amount_inc_vat, expense_type, status",
        );
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });

  const debtPaymentsQ = useQuery({
    queryKey: ["finance", "debt-payments", FINANCE_YEAR],
    queryFn: async (): Promise<DebtPayment[]> => {
      const { data, error } = await supabase
        .from("financial_debt_payments")
        .select("id, period_id, planned_amount, actual_amount, status");
      if (error) throw error;
      return (data ?? []) as DebtPayment[];
    },
  });

  const accountsQ = useQuery({
    queryKey: ["finance", "bank-accounts"],
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, account_name, bank_name, currency, is_active")
        .order("account_name");
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });

  const snapshotsQ = useQuery({
    queryKey: ["finance", "bank-snapshots"],
    queryFn: async (): Promise<BankSnapshot[]> => {
      const { data, error } = await supabase
        .from("bank_balance_snapshots")
        .select("id, bank_account_id, snapshot_date, balance")
        .order("snapshot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankSnapshot[];
    },
  });

  return {
    periodsQ,
    incomeQ,
    expensesQ,
    debtPaymentsQ,
    accountsQ,
    snapshotsQ,
    loading:
      periodsQ.isLoading ||
      incomeQ.isLoading ||
      expensesQ.isLoading ||
      debtPaymentsQ.isLoading ||
      accountsQ.isLoading ||
      snapshotsQ.isLoading,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtEUR = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v || 0);

const fmtEUR2 = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(v || 0);

type VatMode = "inc" | "ex";

function pickAmount(
  ex: number,
  inc: number | null | undefined,
  vatAmt: number | null | undefined,
  mode: VatMode,
): number {
  if (mode === "ex") return Number(ex || 0);
  if (inc != null) return Number(inc);
  return Number(ex || 0) + Number(vatAmt || 0);
}

type CashFlowRow = {
  period: Period;
  opening: number;
  income: number;
  expenses: number;
  materials: number;
  debts: number;
  net: number;
  closing: number;
};

function buildCashFlow(
  periods: Period[],
  income: IncomeRow[],
  expenses: ExpenseRow[],
  debtPayments: DebtPayment[],
  vatMode: VatMode,
): CashFlowRow[] {
  const rows: CashFlowRow[] = [];
  let runningOpening: number | null = null;

  for (const p of periods) {
    const seedOpening = Number(p.opening_balance) || 0;
    const opening: number =
      seedOpening > 0 || runningOpening == null ? seedOpening || (runningOpening ?? 0) : runningOpening;

    const periodIncome = income
      .filter((r) => r.period_id === p.id)
      .reduce(
        (s, r) => s + pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
        0,
      );

    const periodExpenseRows = expenses.filter((r) => r.period_id === p.id);
    const periodExpenses = periodExpenseRows
      .filter((r) => r.expense_type !== "materials")
      .reduce(
        (s, r) => s + pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
        0,
      );
    const periodMaterials = periodExpenseRows
      .filter((r) => r.expense_type === "materials")
      .reduce(
        (s, r) => s + pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
        0,
      );

    const periodDebts = debtPayments
      .filter((r) => r.period_id === p.id)
      .reduce(
        (s, r) => s + Number(r.actual_amount ?? r.planned_amount ?? 0),
        0,
      );

    const net = periodIncome - periodExpenses - periodMaterials - periodDebts;
    const closing = opening + net;
    runningOpening = closing;

    rows.push({
      period: p,
      opening,
      income: periodIncome,
      expenses: periodExpenses,
      materials: periodMaterials,
      debts: periodDebts,
      net,
      closing,
    });
  }

  return rows;
}

function latestSnapshotByAccount(
  snapshots: BankSnapshot[],
): Map<string, BankSnapshot> {
  const map = new Map<string, BankSnapshot>();
  for (const s of snapshots) {
    const existing = map.get(s.bank_account_id);
    if (!existing || existing.snapshot_date < s.snapshot_date) {
      map.set(s.bank_account_id, s);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function FinanceDashboardPage() {
  const { t } = useTranslation(["finance", "common"]);
  const { isAdmin, loading: authLoading } = useAuth();
  const { permissions, loading: permsLoading } = useMyPermissions();
  const navigate = useNavigate();
  const [vatMode, setVatMode] = useState<VatMode>("inc");

  const allowed = isAdmin || permissions.has("finance.dashboard");
  const accessLoading = authLoading || permsLoading;

  if (accessLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 text-sm text-muted-foreground">
        {t("common:loading")}
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("finance:noAccess.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("finance:noAccess.body")}
        </p>
        <Button className="mt-6" onClick={() => navigate({ to: "/" })}>
          {t("common:goHome")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 lg:py-10 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {t("finance:page.kicker")}
          </div>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
            {t("finance:page.title")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">
            {t("finance:page.vatToggle")}
          </Label>
          <Select value={vatMode} onValueChange={(v) => setVatMode(v as VatMode)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inc">{t("finance:page.vatInc")}</SelectItem>
              <SelectItem value="ex">{t("finance:page.vatEx")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">{t("finance:tabs.overview")}</TabsTrigger>
          <TabsTrigger value="cashFlow">{t("finance:tabs.cashFlow")}</TabsTrigger>
          <TabsTrigger value="income">{t("finance:tabs.income")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("finance:tabs.expenses")}</TabsTrigger>
          <TabsTrigger value="materials">{t("finance:tabs.materials")}</TabsTrigger>
          <TabsTrigger value="debts">{t("finance:tabs.debts")}</TabsTrigger>
          <TabsTrigger value="bankBalances">
            {t("finance:tabs.bankBalances")}
          </TabsTrigger>
          <TabsTrigger value="importLogs">
            {t("finance:tabs.importLogs")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab vatMode={vatMode} />
        </TabsContent>
        <TabsContent value="cashFlow" className="mt-6">
          <CashFlowTab vatMode={vatMode} />
        </TabsContent>
        <TabsContent value="bankBalances" className="mt-6">
          <BankBalancesTab />
        </TabsContent>
        <TabsContent value="income" className="mt-6">
          <PlaceholderTab />
        </TabsContent>
        <TabsContent value="expenses" className="mt-6">
          <PlaceholderTab />
        </TabsContent>
        <TabsContent value="materials" className="mt-6">
          <PlaceholderTab />
        </TabsContent>
        <TabsContent value="debts" className="mt-6">
          <PlaceholderTab />
        </TabsContent>
        <TabsContent value="importLogs" className="mt-6">
          <PlaceholderTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function PlaceholderTab() {
  const { t } = useTranslation(["finance"]);
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        <div className="font-display text-lg text-foreground">
          {t("finance:tabPlaceholder.title")}
        </div>
        <p className="mt-2">{t("finance:tabPlaceholder.body")}</p>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ vatMode }: { vatMode: VatMode }) {
  const { t } = useTranslation(["finance", "common"]);
  const {
    periodsQ,
    incomeQ,
    expensesQ,
    debtPaymentsQ,
    accountsQ,
    snapshotsQ,
    loading,
  } = useFinanceData();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  const summary = useMemo(() => {
    const periods = periodsQ.data ?? [];
    const income = incomeQ.data ?? [];
    const expenses = expensesQ.data ?? [];
    const debts = debtPaymentsQ.data ?? [];
    const snapshots = snapshotsQ.data ?? [];

    const cashFlow = buildCashFlow(periods, income, expenses, debts, vatMode);
    const currentRow = cashFlow.find((r) => r.period.month === currentMonth);

    const latest = latestSnapshotByAccount(snapshots);
    const currentBank = Array.from(latest.values()).reduce(
      (s, r) => s + Number(r.balance || 0),
      0,
    );

    const projectedClosing =
      currentRow != null
        ? currentBank + currentRow.income - currentRow.expenses - currentRow.materials - currentRow.debts
        : currentBank;

    const today = new Date().toISOString().slice(0, 10);
    const outstanding = income.filter(
      (i) => i.invoice_status !== "paid" && i.invoice_status !== "cancelled",
    );
    const overdue = outstanding.filter(
      (i) =>
        i.expected_payment_date != null &&
        i.expected_payment_date < today &&
        !i.paid_date,
    );

    const sumAmt = (rows: IncomeRow[]) =>
      rows.reduce(
        (s, r) =>
          s + pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
        0,
      );

    return {
      currentBank,
      currentRow,
      projectedClosing,
      outstandingAmount: sumAmt(outstanding),
      outstandingCount: outstanding.length,
      overdueAmount: sumAmt(overdue),
      overdueCount: overdue.length,
    };
  }, [
    periodsQ.data,
    incomeQ.data,
    expensesQ.data,
    debtPaymentsQ.data,
    snapshotsQ.data,
    accountsQ.data,
    vatMode,
    currentMonth,
  ]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
    );
  }

  const cur = summary.currentRow;
  const net = cur ? cur.net : 0;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        {t("finance:overview.vatNote", {
          mode:
            vatMode === "inc"
              ? t("finance:page.vatInc").toLowerCase()
              : t("finance:page.vatEx").toLowerCase(),
        })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label={t("finance:overview.currentBankBalance")}
          sub={t("finance:overview.currentBankBalanceSub")}
          value={fmtEUR(summary.currentBank)}
          tone="neutral"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("finance:overview.expectedIncome")}
          value={cur ? fmtEUR(cur.income) : "—"}
          tone="positive"
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label={t("finance:overview.expectedExpenses")}
          value={cur ? fmtEUR(cur.expenses + cur.materials + cur.debts) : "—"}
          tone="negative"
        />
        <KpiCard
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label={t("finance:overview.projectedClosing")}
          value={fmtEUR(summary.projectedClosing)}
          tone={summary.projectedClosing >= summary.currentBank ? "positive" : "negative"}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label={t("finance:overview.netCashFlow")}
          value={fmtEUR(net)}
          tone={net >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          icon={<AlertCircle className="h-4 w-4" />}
          label={t("finance:overview.outstandingInvoices")}
          value={fmtEUR(summary.outstandingAmount)}
          sub={`${summary.outstandingCount}`}
          tone="neutral"
        />
        <KpiCard
          icon={<AlertCircle className="h-4 w-4" />}
          label={t("finance:overview.overdueInvoices")}
          value={fmtEUR(summary.overdueAmount)}
          sub={`${summary.overdueCount}`}
          tone={summary.overdueCount > 0 ? "negative" : "neutral"}
        />
      </div>

      {!cur && (
        <p className="text-xs text-muted-foreground">
          {t("finance:overview.noPeriod")}
        </p>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-rose-600"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {label}
        </div>
        <div className={cn("mt-3 font-display text-2xl font-semibold tabular-nums", toneClass)}>
          {value}
        </div>
        {sub && (
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}

function CashFlowTab({ vatMode }: { vatMode: VatMode }) {
  const { t } = useTranslation(["finance", "common"]);
  const { periodsQ, incomeQ, expensesQ, debtPaymentsQ, loading } =
    useFinanceData();

  const rows = useMemo(
    () =>
      buildCashFlow(
        periodsQ.data ?? [],
        incomeQ.data ?? [],
        expensesQ.data ?? [],
        debtPaymentsQ.data ?? [],
        vatMode,
      ),
    [periodsQ.data, incomeQ.data, expensesQ.data, debtPaymentsQ.data, vatMode],
  );

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + r.income,
      expenses: acc.expenses + r.expenses,
      materials: acc.materials + r.materials,
      debts: acc.debts + r.debts,
      net: acc.net + r.net,
    }),
    { income: 0, expenses: 0, materials: 0, debts: 0, net: 0 },
  );

  const statusLabel = (s: string) =>
    t(`finance:cashFlow.status.${s}`, { defaultValue: s });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">
          {t("finance:cashFlow.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("finance:cashFlow.subtitle", { year: FINANCE_YEAR })}
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("finance:cashFlow.col.month")}</TableHead>
              <TableHead className="text-right">{t("finance:cashFlow.col.opening")}</TableHead>
              <TableHead className="text-right">{t("finance:cashFlow.col.income")}</TableHead>
              <TableHead className="text-right">{t("finance:cashFlow.col.expenses")}</TableHead>
              <TableHead className="text-right">{t("finance:cashFlow.col.materials")}</TableHead>
              <TableHead className="text-right">{t("finance:cashFlow.col.debts")}</TableHead>
              <TableHead className="text-right">{t("finance:cashFlow.col.net")}</TableHead>
              <TableHead className="text-right">{t("finance:cashFlow.col.closing")}</TableHead>
              <TableHead>{t("finance:cashFlow.col.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.period.id}>
                <TableCell className="font-medium">{r.period.month_name}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtEUR(r.opening)}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700">
                  {fmtEUR(r.income)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-rose-700">
                  {fmtEUR(r.expenses)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-rose-700">
                  {fmtEUR(r.materials)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-rose-700">
                  {fmtEUR(r.debts)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums font-medium",
                    r.net >= 0 ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {fmtEUR(r.net)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {fmtEUR(r.closing)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{statusLabel(r.period.status)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>{t("finance:cashFlow.footer.totals")}</TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums text-emerald-700">
                {fmtEUR(totals.income)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-rose-700">
                {fmtEUR(totals.expenses)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-rose-700">
                {fmtEUR(totals.materials)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-rose-700">
                {fmtEUR(totals.debts)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums font-semibold",
                  totals.net >= 0 ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {fmtEUR(totals.net)}
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function BankBalancesTab() {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const { accountsQ, snapshotsQ, loading } = useFinanceData();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const latest = useMemo(
    () => latestSnapshotByAccount(snapshotsQ.data ?? []),
    [snapshotsQ.data],
  );

  const total = useMemo(
    () =>
      Array.from(latest.values()).reduce(
        (s, r) => s + Number(r.balance || 0),
        0,
      ),
    [latest],
  );

  const insertSnapshot = useMutation({
    mutationFn: async () => {
      const amt = Number(balance);
      if (!accountId || !date || Number.isNaN(amt)) {
        throw new Error("Invalid input");
      }
      const { error } = await supabase.from("bank_balance_snapshots").insert({
        bank_account_id: accountId,
        snapshot_date: date,
        balance: amt,
        source: "manual",
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("finance:bank.form.saved"));
      qc.invalidateQueries({ queryKey: ["finance", "bank-snapshots"] });
      setOpen(false);
      setBalance("");
      setNotes("");
    },
    onError: (e: Error) => {
      toast.error(e.message || t("finance:bank.form.saveError"));
    },
  });

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
    );
  }

  const accounts = accountsQ.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-lg">
            {t("finance:bank.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {t("finance:bank.totalCurrent")}:{" "}
            <span className="font-semibold text-foreground">{fmtEUR2(total)}</span>
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("finance:bank.newSnapshot")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("finance:bank.newSnapshotTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("finance:bank.form.account")}</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("finance:bank.form.date")}</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("finance:bank.form.balance")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("finance:bank.form.notes")}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={insertSnapshot.isPending || !accountId || !balance}
                onClick={() => insertSnapshot.mutate()}
              >
                {t("finance:bank.form.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("finance:bank.col.account")}</TableHead>
              <TableHead>{t("finance:bank.col.bank")}</TableHead>
              <TableHead>{t("finance:bank.col.currency")}</TableHead>
              <TableHead className="text-right">
                {t("finance:bank.col.latest")}
              </TableHead>
              <TableHead>{t("finance:bank.col.asOf")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  {t("finance:bank.empty")}
                </TableCell>
              </TableRow>
            )}
            {accounts.map((a) => {
              const snap = latest.get(a.id);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.account_name}</TableCell>
                  <TableCell>{a.bank_name ?? "—"}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {snap ? fmtEUR2(Number(snap.balance)) : t("finance:bank.noSnapshot")}
                  </TableCell>
                  <TableCell>{snap?.snapshot_date ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Helper for /finance hub link reused elsewhere
export const FINANCE_LINK = "/finance" as const;
