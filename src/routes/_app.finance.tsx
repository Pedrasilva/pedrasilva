import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
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
import { BankReconciliationTab } from "@/components/finance/bank-reconciliation";
import { DocumentsTab } from "@/components/finance/documents-tab";
import { ProjectFinancialPanel } from "@/components/finance/project-financial-panel";
import { ClientsMasterData } from "@/components/finance/clients-master-data";
import { SuppliersMasterData } from "@/components/finance/suppliers-master-data";
import { AdminResetTool } from "@/components/finance/admin-reset-tool";

async function checkFinanceAccess(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return false;

  // Check admin role
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return true;

  // Check finance.dashboard permission
  const { data: permRow } = await supabase
    .from("user_permissions")
    .select("permission_key")
    .eq("user_id", userId)
    .eq("permission_key", "finance.dashboard")
    .maybeSingle();
  return !!permRow;
}

export const Route = createFileRoute("/_app/finance")({
  beforeLoad: async () => {
    const allowed = await checkFinanceAccess();
    if (!allowed) {
      throw redirect({ to: "/" });
    }
  },
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

const DASH = "—";

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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return DASH;
  return dateFmt.format(d);
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return DASH;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return DASH;
  return dateTimeFmt.format(d);
}

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
          <TabsTrigger value="bankRec">{t("finance:tabs.bankRec")}</TabsTrigger>
          <TabsTrigger value="documents">{t("finance:tabsExtra.documents")}</TabsTrigger>
          <TabsTrigger value="clients">{t("finance:clientsMaster.tab")}</TabsTrigger>
          <TabsTrigger value="suppliers">{t("finance:suppliersMaster.tab")}</TabsTrigger>
          <TabsTrigger value="projectFin">{t("finance:projectFinancials.title")}</TabsTrigger>
          <TabsTrigger value="importLogs">
            {t("finance:tabs.importLogs")}
          </TabsTrigger>
          <TabsTrigger value="admin">{t("finance:reset.tab")}</TabsTrigger>
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
          <IncomeTab vatMode={vatMode} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-6">
          <ExpensesTab vatMode={vatMode} kind="operational" />
        </TabsContent>
        <TabsContent value="materials" className="mt-6">
          <ExpensesTab vatMode={vatMode} kind="materials" />
        </TabsContent>
        <TabsContent value="debts" className="mt-6">
          <DebtsTab />
        </TabsContent>
        <TabsContent value="bankRec" className="mt-6">
          <BankReconciliationTab />
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <DocumentsTab />
        </TabsContent>
        <TabsContent value="projectFin" className="mt-6">
          <ProjectFinancialPanel />
        </TabsContent>
        <TabsContent value="clients" className="mt-6">
          <ClientsMasterData />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-6">
          <SuppliersMasterData />
        </TabsContent>
        <TabsContent value="importLogs" className="mt-6">
          <ImportLogsTab />
        </TabsContent>
        <TabsContent value="admin" className="mt-6">
          <AdminResetTool />
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
                  <TableCell>{a.bank_name ?? DASH}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {snap ? fmtEUR2(Number(snap.balance)) : t("finance:bank.noSnapshot")}
                  </TableCell>
                  <TableCell className="tabular-nums">{fmtDate(snap?.snapshot_date)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Income tab (read-only)
// ---------------------------------------------------------------------------

type IncomeFull = {
  id: string;
  period_id: string | null;
  client_id: string | null;
  project_name: string | null;
  project_code: string | null;
  invoice_number: string | null;
  invoice_status: string;
  issue_date: string | null;
  expected_payment_date: string | null;
  paid_date: string | null;
  amount_ex_vat: number;
  vat_amount: number | null;
  amount_inc_vat: number | null;
  vat_rate: number;
};

function useIncomeFull() {
  return useQuery({
    queryKey: ["finance", "income-full", FINANCE_YEAR],
    queryFn: async (): Promise<IncomeFull[]> => {
      const { data, error } = await supabase
        .from("financial_income_items")
        .select(
          "id, period_id, client_id, project_name, project_code, invoice_number, invoice_status, issue_date, expected_payment_date, paid_date, amount_ex_vat, vat_amount, amount_inc_vat, vat_rate",
        )
        .order("expected_payment_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as IncomeFull[];
    },
  });
}

function useClientsMap() {
  return useQuery({
    queryKey: ["finance", "clients-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome")
        .eq("is_client", true);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) m.set(r.id, r.nome);
      return m;
    },
  });
}

function usePeriodsMap() {
  return useQuery({
    queryKey: ["finance", "periods-map", FINANCE_YEAR],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_periods")
        .select("id, month, month_name")
        .eq("year", FINANCE_YEAR)
        .order("month");
      if (error) throw error;
      const m = new Map<string, { month: number; month_name: string }>();
      for (const r of data ?? [])
        m.set(r.id, { month: r.month, month_name: r.month_name });
      return m;
    },
  });
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation(["finance"]);
  const tone =
    status === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : status === "overdue"
        ? "bg-rose-100 text-rose-800"
        : status === "cancelled"
          ? "bg-muted text-muted-foreground"
          : status === "issued"
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-700";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {t(`finance:invoiceStatus.${status}`, { defaultValue: status })}
    </span>
  );
}

function MonthFilter({
  value,
  onChange,
  periods,
}: {
  value: string;
  onChange: (v: string) => void;
  periods: { id: string; month: number; month_name: string }[];
}) {
  const { t } = useTranslation(["finance"]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("finance:filter.allMonths")}</SelectItem>
        {periods.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.month_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IncomeTab({ vatMode }: { vatMode: VatMode }) {
  const { t } = useTranslation(["finance", "common"]);
  const incomeQ = useIncomeFull();
  const clientsQ = useClientsMap();
  const periodsQ = usePeriodsMap();
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const periodOptions = useMemo(
    () =>
      Array.from(periodsQ.data?.entries() ?? []).map(([id, p]) => ({
        id,
        ...p,
      })),
    [periodsQ.data],
  );

  const rows = useMemo(() => {
    const all = incomeQ.data ?? [];
    return all.filter((r) => {
      if (monthFilter !== "all" && r.period_id !== monthFilter) return false;
      if (statusFilter !== "all" && r.invoice_status !== statusFilter)
        return false;
      return true;
    });
  }, [incomeQ.data, monthFilter, statusFilter]);

  const totals = useMemo(() => {
    const total = rows.reduce(
      (s, r) =>
        s + pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
      0,
    );
    const paid = rows
      .filter((r) => r.invoice_status === "paid")
      .reduce(
        (s, r) =>
          s +
          pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
        0,
      );
    return { total, paid, outstanding: total - paid, count: rows.length };
  }, [rows, vatMode]);

  if (incomeQ.isLoading || clientsQ.isLoading || periodsQ.isLoading) {
    return (
      <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle className="font-display text-lg">
              {t("finance:income.title")}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("finance:income.subtitle", { count: totals.count })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MonthFilter
              value={monthFilter}
              onChange={setMonthFilter}
              periods={periodOptions}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("finance:filter.allStatuses")}
                </SelectItem>
                <SelectItem value="planned">
                  {t("finance:invoiceStatus.planned")}
                </SelectItem>
                <SelectItem value="issued">
                  {t("finance:invoiceStatus.issued")}
                </SelectItem>
                <SelectItem value="paid">
                  {t("finance:invoiceStatus.paid")}
                </SelectItem>
                <SelectItem value="overdue">
                  {t("finance:invoiceStatus.overdue")}
                </SelectItem>
                <SelectItem value="cancelled">
                  {t("finance:invoiceStatus.cancelled")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 text-xs">
          <SummaryStat
            label={t("finance:income.summary.total")}
            value={fmtEUR(totals.total)}
          />
          <SummaryStat
            label={t("finance:income.summary.paid")}
            value={fmtEUR(totals.paid)}
            tone="text-emerald-700"
          />
          <SummaryStat
            label={t("finance:income.summary.outstanding")}
            value={fmtEUR(totals.outstanding)}
            tone="text-amber-700"
          />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("finance:income.col.month")}</TableHead>
              <TableHead>{t("finance:income.col.client")}</TableHead>
              <TableHead>{t("finance:income.col.project")}</TableHead>
              <TableHead>{t("finance:income.col.invoice")}</TableHead>
              <TableHead>{t("finance:income.col.expected")}</TableHead>
              <TableHead>{t("finance:income.col.paid")}</TableHead>
              <TableHead className="text-right">
                {t("finance:income.col.amount")}
              </TableHead>
              <TableHead>{t("finance:income.col.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  {t("finance:income.empty")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const period = r.period_id ? periodsQ.data?.get(r.period_id) : null;
              const client = r.client_id ? clientsQ.data?.get(r.client_id) : null;
              const amt = pickAmount(
                r.amount_ex_vat,
                r.amount_inc_vat,
                r.vat_amount,
                vatMode,
              );
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {period?.month_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{client ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {r.project_code ? (
                      <span className="text-muted-foreground mr-1">
                        {r.project_code}
                      </span>
                    ) : null}
                    {r.project_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {r.invoice_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {fmtDate(r.expected_payment_date)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {fmtDate(r.paid_date)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEUR2(amt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.invoice_status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6}>
                  {t("finance:income.summary.total")}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmtEUR2(totals.total)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
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
          "mt-1 font-display text-base font-semibold tabular-nums",
          tone ?? "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses & Materials tab (read-only, shared)
// ---------------------------------------------------------------------------

type ExpenseFull = {
  id: string;
  period_id: string | null;
  supplier_id: string | null;
  category_id: string | null;
  expense_type: string;
  status: string;
  description: string | null;
  due_date: string | null;
  paid_date: string | null;
  amount_ex_vat: number;
  vat_amount: number | null;
  amount_inc_vat: number | null;
  actual_amount_inc_vat: number | null;
  vat_rate: number;
};

function useExpensesFull() {
  return useQuery({
    queryKey: ["finance", "expenses-full"],
    queryFn: async (): Promise<ExpenseFull[]> => {
      const { data, error } = await supabase
        .from("financial_expense_items")
        .select(
          "id, period_id, supplier_id, category_id, expense_type, status, description, due_date, paid_date, amount_ex_vat, vat_amount, amount_inc_vat, actual_amount_inc_vat, vat_rate",
        )
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ExpenseFull[];
    },
  });
}

function useSuppliersMap() {
  return useQuery({
    queryKey: ["finance", "suppliers-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome")
        .eq("is_supplier", true);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) m.set(r.id, r.nome);
      return m;
    },
  });
}

function useCategoriesMap() {
  return useQuery({
    queryKey: ["finance", "categories-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) m.set(r.id, r.name);
      return m;
    },
  });
}

function ExpenseStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation(["finance"]);
  const tone =
    status === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : status === "overdue"
        ? "bg-rose-100 text-rose-800"
        : status === "cancelled"
          ? "bg-muted text-muted-foreground"
          : status === "confirmed"
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-700";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {t(`finance:expenseStatus.${status}`, { defaultValue: status })}
    </span>
  );
}

function ExpensesTab({
  vatMode,
  kind,
}: {
  vatMode: VatMode;
  kind: "operational" | "materials";
}) {
  const { t } = useTranslation(["finance", "common"]);
  const expensesQ = useExpensesFull();
  const suppliersQ = useSuppliersMap();
  const categoriesQ = useCategoriesMap();
  const periodsQ = usePeriodsMap();
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const periodOptions = useMemo(
    () =>
      Array.from(periodsQ.data?.entries() ?? []).map(([id, p]) => ({
        id,
        ...p,
      })),
    [periodsQ.data],
  );

  const rows = useMemo(() => {
    const all = expensesQ.data ?? [];
    const wantType = kind === "materials" ? "materials" : null;
    return all.filter((r) => {
      if (kind === "materials") {
        if (r.expense_type !== "materials") return false;
      } else {
        if (r.expense_type === "materials") return false;
      }
      if (wantType && r.expense_type !== wantType) return false;
      if (monthFilter !== "all" && r.period_id !== monthFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [expensesQ.data, kind, monthFilter, statusFilter]);

  const totals = useMemo(() => {
    const total = rows.reduce(
      (s, r) =>
        s + pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
      0,
    );
    const paid = rows
      .filter((r) => r.status === "paid")
      .reduce(
        (s, r) =>
          s + pickAmount(r.amount_ex_vat, r.amount_inc_vat, r.vat_amount, vatMode),
        0,
      );
    return { total, paid, outstanding: total - paid, count: rows.length };
  }, [rows, vatMode]);

  const titleKey =
    kind === "materials" ? "finance:materials.title" : "finance:expenses.title";
  const subtitleKey =
    kind === "materials"
      ? "finance:materials.subtitle"
      : "finance:expenses.subtitle";
  const emptyKey =
    kind === "materials" ? "finance:materials.empty" : "finance:expenses.empty";

  if (
    expensesQ.isLoading ||
    suppliersQ.isLoading ||
    categoriesQ.isLoading ||
    periodsQ.isLoading
  ) {
    return (
      <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle className="font-display text-lg">{t(titleKey)}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(subtitleKey, { count: totals.count })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MonthFilter
              value={monthFilter}
              onChange={setMonthFilter}
              periods={periodOptions}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("finance:filter.allStatuses")}
                </SelectItem>
                <SelectItem value="projected">
                  {t("finance:expenseStatus.projected")}
                </SelectItem>
                <SelectItem value="confirmed">
                  {t("finance:expenseStatus.confirmed")}
                </SelectItem>
                <SelectItem value="paid">
                  {t("finance:expenseStatus.paid")}
                </SelectItem>
                <SelectItem value="overdue">
                  {t("finance:expenseStatus.overdue")}
                </SelectItem>
                <SelectItem value="cancelled">
                  {t("finance:expenseStatus.cancelled")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 text-xs">
          <SummaryStat
            label={t("finance:expenses.summary.total")}
            value={fmtEUR(totals.total)}
          />
          <SummaryStat
            label={t("finance:expenses.summary.paid")}
            value={fmtEUR(totals.paid)}
            tone="text-emerald-700"
          />
          <SummaryStat
            label={t("finance:expenses.summary.outstanding")}
            value={fmtEUR(totals.outstanding)}
            tone="text-rose-700"
          />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("finance:expenses.col.month")}</TableHead>
              <TableHead>{t("finance:expenses.col.supplier")}</TableHead>
              <TableHead>{t("finance:expenses.col.category")}</TableHead>
              <TableHead>{t("finance:expenses.col.description")}</TableHead>
              <TableHead>{t("finance:expenses.col.due")}</TableHead>
              <TableHead>{t("finance:expenses.col.paid")}</TableHead>
              <TableHead className="text-right">
                {t("finance:expenses.col.amount")}
              </TableHead>
              <TableHead>{t("finance:expenses.col.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  {t(emptyKey)}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const period = r.period_id ? periodsQ.data?.get(r.period_id) : null;
              const supplier = r.supplier_id
                ? suppliersQ.data?.get(r.supplier_id)
                : null;
              const category = r.category_id
                ? categoriesQ.data?.get(r.category_id)
                : null;
              const amt = pickAmount(
                r.amount_ex_vat,
                r.amount_inc_vat,
                r.vat_amount,
                vatMode,
              );
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {period?.month_name ?? DASH}
                  </TableCell>
                  <TableCell className="text-sm">{supplier ?? DASH}</TableCell>
                  <TableCell className="text-sm">{category ?? DASH}</TableCell>
                  <TableCell className="text-sm max-w-[280px] truncate">
                    {r.description ?? DASH}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {fmtDate(r.due_date)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {fmtDate(r.paid_date)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEUR2(amt)}
                  </TableCell>
                  <TableCell>
                    <ExpenseStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6}>
                  {t("finance:expenses.summary.total")}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmtEUR2(totals.total)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Debts Tab
// ---------------------------------------------------------------------------

type DebtRow = {
  id: string;
  creditor_name: string;
  description: string | null;
  original_amount: number;
  outstanding_amount: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

type DebtPaymentFull = {
  id: string;
  debt_id: string;
  period_id: string | null;
  due_date: string | null;
  paid_date: string | null;
  planned_amount: number;
  actual_amount: number | null;
  status: string;
};

function DebtStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation(["finance"]);
  const map: Record<string, string> = {
    open: "bg-amber-100 text-amber-900",
    paid: "bg-emerald-100 text-emerald-900",
    cancelled: "bg-muted text-muted-foreground",
    defaulted: "bg-rose-100 text-rose-900",
  };
  return (
    <Badge variant="secondary" className={cn("font-normal", map[status] ?? "")}>
      {t(`finance:debtStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

function DebtsTab() {
  const { t } = useTranslation(["finance", "common"]);

  const debtsQ = useQuery({
    queryKey: ["finance", "debts"],
    queryFn: async (): Promise<DebtRow[]> => {
      const { data, error } = await supabase
        .from("financial_debts")
        .select(
          "id, creditor_name, description, original_amount, outstanding_amount, status, start_date, end_date",
        )
        .order("creditor_name");
      if (error) throw error;
      return (data ?? []) as DebtRow[];
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["finance", "debt-payments-full"],
    queryFn: async (): Promise<DebtPaymentFull[]> => {
      const { data, error } = await supabase
        .from("financial_debt_payments")
        .select(
          "id, debt_id, period_id, due_date, paid_date, planned_amount, actual_amount, status",
        )
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DebtPaymentFull[];
    },
  });

  const periodsQ = useQuery({
    queryKey: ["finance", "periods-map"],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("financial_periods")
        .select("id, month_name, year");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) {
        m.set(p.id as string, `${p.month_name} ${p.year}`);
      }
      return m;
    },
  });

  const paymentsByDebt = useMemo(() => {
    const m = new Map<string, DebtPaymentFull[]>();
    for (const p of paymentsQ.data ?? []) {
      const arr = m.get(p.debt_id) ?? [];
      arr.push(p);
      m.set(p.debt_id, arr);
    }
    return m;
  }, [paymentsQ.data]);

  const debts = debtsQ.data ?? [];
  const totalOriginal = debts.reduce((s, d) => s + Number(d.original_amount || 0), 0);
  const totalOutstanding = debts.reduce(
    (s, d) => s + Number(d.outstanding_amount || 0),
    0,
  );

  const loading = debtsQ.isLoading || paymentsQ.isLoading || periodsQ.isLoading;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("common:loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="font-display text-xl">
                {t("finance:debts.title")}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {t("finance:debts.subtitle", { count: debts.length })}
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-xs">
              <SummaryStat
                label={t("finance:debts.summary.original")}
                value={fmtEUR(totalOriginal)}
              />
              <SummaryStat
                label={t("finance:debts.summary.outstanding")}
                value={fmtEUR(totalOutstanding)}
                tone="text-rose-700"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance:debts.col.creditor")}</TableHead>
                <TableHead>{t("finance:debts.col.description")}</TableHead>
                <TableHead className="text-right">
                  {t("finance:debts.col.original")}
                </TableHead>
                <TableHead className="text-right">
                  {t("finance:debts.col.outstanding")}
                </TableHead>
                <TableHead>{t("finance:debts.col.status")}</TableHead>
                <TableHead>{t("finance:debts.col.startDate")}</TableHead>
                <TableHead>{t("finance:debts.col.endDate")}</TableHead>
                <TableHead className="text-right">
                  {t("finance:debts.col.scheduled")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    {t("finance:debts.empty")}
                  </TableCell>
                </TableRow>
              )}
              {debts.map((d) => {
                const ps = paymentsByDebt.get(d.id) ?? [];
                const scheduled = ps.length;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm font-medium">
                      {d.creditor_name}
                    </TableCell>
                    <TableCell className="text-sm max-w-[280px] truncate">
                      {d.description ?? DASH}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR2(Number(d.original_amount))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR2(Number(d.outstanding_amount))}
                    </TableCell>
                    <TableCell>
                      <DebtStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {fmtDate(d.start_date)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {fmtDate(d.end_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {scheduled > 0
                        ? t("finance:debts.scheduledCount", { count: scheduled })
                        : DASH}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            {t("finance:debts.payments.title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t("finance:debts.payments.subtitle", {
              count: paymentsQ.data?.length ?? 0,
            })}
          </p>
        </CardHeader>
        <CardContent>
          {(paymentsQ.data?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("finance:debts.payments.empty")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance:debts.payments.col.creditor")}</TableHead>
                  <TableHead>{t("finance:debts.payments.col.month")}</TableHead>
                  <TableHead>{t("finance:debts.payments.col.due")}</TableHead>
                  <TableHead>{t("finance:debts.payments.col.paid")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance:debts.payments.col.planned")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:debts.payments.col.actual")}
                  </TableHead>
                  <TableHead>{t("finance:debts.payments.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(paymentsQ.data ?? []).map((p) => {
                  const debt = debts.find((d) => d.id === p.debt_id);
                  const period = p.period_id
                    ? periodsQ.data?.get(p.period_id)
                    : null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {debt?.creditor_name ?? DASH}
                      </TableCell>
                      <TableCell className="text-sm">{period ?? DASH}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {fmtDate(p.due_date)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {fmtDate(p.paid_date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR2(Number(p.planned_amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.actual_amount != null
                          ? fmtEUR2(Number(p.actual_amount))
                          : DASH}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {t(`finance:debtPaymentStatus.${p.status}`, {
                            defaultValue: p.status,
                          })}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Logs Tab
// ---------------------------------------------------------------------------

type ImportLogRow = {
  id: string;
  imported_at: string;
  file_name: string;
  import_type: string;
  file_checksum: string | null;
  source_file_size_bytes: number | null;
  rows_expenses: number;
  rows_income: number;
  rows_suppliers: number;
  rows_clients: number;
  rows_debts: number;
  rows_bank_accounts: number;
  notes: string | null;
};

function fmtBytes(n: number | null): string {
  if (n == null) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function ImportLogsTab() {
  const { t } = useTranslation(["finance", "common"]);

  const logsQ = useQuery({
    queryKey: ["finance", "import-logs"],
    queryFn: async (): Promise<ImportLogRow[]> => {
      const { data, error } = await supabase
        .from("financial_import_logs")
        .select(
          "id, imported_at, file_name, import_type, file_checksum, source_file_size_bytes, rows_expenses, rows_income, rows_suppliers, rows_clients, rows_debts, rows_bank_accounts, notes",
        )
        .order("imported_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImportLogRow[];
    },
  });

  if (logsQ.isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("common:loading")}
        </CardContent>
      </Card>
    );
  }

  const logs = logsQ.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">
          {t("finance:importLogs.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {t("finance:importLogs.subtitle", { count: logs.length })}
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("finance:importLogs.col.importedAt")}</TableHead>
              <TableHead>{t("finance:importLogs.col.fileName")}</TableHead>
              <TableHead>{t("finance:importLogs.col.importType")}</TableHead>
              <TableHead>{t("finance:importLogs.col.fileSize")}</TableHead>
              <TableHead>{t("finance:importLogs.col.checksum")}</TableHead>
              <TableHead className="text-right">
                {t("finance:importLogs.col.rowsExpenses")}
              </TableHead>
              <TableHead className="text-right">
                {t("finance:importLogs.col.rowsIncome")}
              </TableHead>
              <TableHead className="text-right">
                {t("finance:importLogs.col.rowsSuppliers")}
              </TableHead>
              <TableHead className="text-right">
                {t("finance:importLogs.col.rowsClients")}
              </TableHead>
              <TableHead className="text-right">
                {t("finance:importLogs.col.rowsDebts")}
              </TableHead>
              <TableHead className="text-right">
                {t("finance:importLogs.col.rowsBankAccounts")}
              </TableHead>
              <TableHead>{t("finance:importLogs.col.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  {t("finance:importLogs.empty")}
                </TableCell>
              </TableRow>
            )}
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                  {fmtDateTime(l.imported_at)}
                </TableCell>
                <TableCell className="text-sm max-w-[220px] truncate">
                  {l.file_name}
                </TableCell>
                <TableCell className="text-sm">
                  <Badge variant="secondary" className="font-normal">
                    {l.import_type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {fmtBytes(l.source_file_size_bytes)}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {l.file_checksum ? (
                    <code
                      className="select-all cursor-text rounded bg-muted px-1.5 py-0.5"
                      title={l.file_checksum}
                    >
                      {l.file_checksum.slice(0, 8)}…{l.file_checksum.slice(-4)}
                    </code>
                  ) : (
                    DASH
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.rows_expenses}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.rows_income}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.rows_suppliers}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.rows_clients}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.rows_debts}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.rows_bank_accounts}
                </TableCell>
                <TableCell className="text-sm max-w-[200px] truncate text-muted-foreground">
                  {l.notes ?? DASH}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Helper for /finance hub link reused elsewhere
export const FINANCE_LINK = "/finance" as const;
