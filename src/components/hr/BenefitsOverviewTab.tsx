/**
 * Admin/approver overview of benefit balances per collaborator.
 *
 * Answers "what did each person start with, what have they used and what is
 * left" in one screen. Reads the same three sources the collaborator view
 * uses (`benefit_balances`, `benefit_yearly_credits`, `benefit_expenses_v`)
 * and aggregates client-side — the team is small, so no new SQL is needed.
 */
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { ChevronDown, ChevronRight, Download, Settings2, Receipt } from "lucide-react";
import { fmtEUR } from "@/lib/salary";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  balanceByCategory,
  type BenefitBalance,
  type BenefitCategory,
  type BenefitExpenseRow,
  type BenefitYearlyCredit,
} from "@/lib/benefits";

// The benefit tables are not fully typed yet; RLS controls access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const CATS: BenefitCategory[] = ["carro", "ticket", "premio", "outros"];

type CollabBasic = {
  id: string;
  nome: string;
  foto_path: string | null;
  archived_at: string | null;
};

type Row = {
  id: string;
  nome: string;
  foto_path: string | null;
  archived: boolean;
  inicial: number;
  creditado: number;
  gasto: number;
  disponivel: number;
  pendente: number;
  aprovada: number;
  paga: number;
  byCat: Record<
    BenefitCategory,
    { inicial: number; creditado: number; gasto: number; disponivel: number }
  >;
};

export function BenefitsOverviewTab({
  onManageBalances,
  onViewExpenses,
}: {
  onManageBalances?: (collaboratorId: string) => void;
  onViewExpenses?: (collaboratorId: string) => void;
}) {
  const { t } = useTranslation(["hr", "common"]);
  const currentYear = new Date().getFullYear();

  // Balances are cumulative across years, so "all years" is the honest default.
  const [year, setYear] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "spent" | "remaining">("name");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statementFor, setStatementFor] = useState<Row | null>(null);

  const collaboratorsQ = useQuery({
    queryKey: ["collaborators", "basic-benefits-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_collaborators_basic");
      if (error) throw error;
      return (data ?? []) as unknown as CollabBasic[];
    },
  });

  const balancesQ = useQuery({
    queryKey: ["benefit-balances", "all"],
    queryFn: async () => {
      const { data, error } = await sb.from("benefit_balances").select("*");
      if (error) throw error;
      return (data ?? []) as BenefitBalance[];
    },
  });

  const creditsQ = useQuery({
    queryKey: ["benefit-credits", "all"],
    queryFn: async () => {
      const { data, error } = await sb.from("benefit_yearly_credits").select("*");
      if (error) throw error;
      return (data ?? []) as BenefitYearlyCredit[];
    },
  });

  const expensesQ = useQuery({
    queryKey: ["benefit-expenses-overview", "all"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("benefit_expenses_v")
        .select("*")
        .order("data_despesa", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BenefitExpenseRow[];
    },
  });

  const loading =
    collaboratorsQ.isLoading || balancesQ.isLoading || creditsQ.isLoading || expensesQ.isLoading;

  const years = useMemo(() => {
    const s = new Set<number>();
    for (const e of expensesQ.data ?? []) s.add(e.ano_fiscal);
    for (const c of creditsQ.data ?? []) s.add(c.ano_fiscal);
    s.add(currentYear);
    return Array.from(s).sort((a, b) => b - a);
  }, [expensesQ.data, creditsQ.data, currentYear]);

  const rows: Row[] = useMemo(() => {
    const collabs = collaboratorsQ.data ?? [];
    const balances = balancesQ.data ?? [];
    const credits = (creditsQ.data ?? []).filter((c) => year === "all" || c.ano_fiscal === year);
    const expenses = (expensesQ.data ?? []).filter((e) => year === "all" || e.ano_fiscal === year);

    const byCollab = <T extends { collaborator_id: string }>(list: T[]) => {
      const m: Record<string, T[]> = {};
      for (const x of list) (m[x.collaborator_id] ||= []).push(x);
      return m;
    };
    const bMap = byCollab(balances);
    const cMap = byCollab(credits);
    const eMap = byCollab(expenses);

    return collabs.map((c) => {
      const exp = eMap[c.id] ?? [];
      const byCat = balanceByCategory({
        balances: bMap[c.id] ?? [],
        credits: cMap[c.id] ?? [],
        expenses: exp,
      });
      const sum = (k: "inicial" | "creditado" | "gasto" | "disponivel") =>
        CATS.reduce((acc, cat) => acc + byCat[cat][k], 0);
      const byState = { pendente: 0, aprovada: 0, paga: 0 };
      for (const e of exp) {
        if (e.estado === "rejeitada") continue;
        byState[e.estado as "pendente" | "aprovada" | "paga"] += Number(e.valor) || 0;
      }
      return {
        id: c.id,
        nome: c.nome,
        foto_path: c.foto_path,
        archived: c.archived_at !== null,
        inicial: sum("inicial"),
        creditado: sum("creditado"),
        gasto: sum("gasto"),
        disponivel: sum("disponivel"),
        ...byState,
        byCat,
      };
    });
  }, [collaboratorsQ.data, balancesQ.data, creditsQ.data, expensesQ.data, year]);

  /** Expenses of the selected period, per collaborator, oldest first. */
  const expensesByCollab = useMemo(() => {
    const m: Record<string, BenefitExpenseRow[]> = {};
    for (const e of expensesQ.data ?? []) {
      if (year !== "all" && e.ano_fiscal !== year) continue;
      (m[e.collaborator_id] ||= []).push(e);
    }
    for (const k of Object.keys(m))
      m[k].sort((a, b) => (a.data_despesa < b.data_despesa ? -1 : 1));
    return m;
  }, [expensesQ.data, year]);


  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!includeArchived && r.archived) return false;
      if (q && !r.nome.toLowerCase().includes(q)) return false;
      // Hide people with no benefit activity at all to keep the table useful.
      return r.inicial !== 0 || r.creditado !== 0 || r.gasto !== 0;
    });
    return list.sort((a, b) => {
      if (sort === "spent") return b.gasto - a.gasto;
      if (sort === "remaining") return a.disponivel - b.disponivel;
      return a.nome.localeCompare(b.nome);
    });
  }, [rows, search, sort, includeArchived]);

  const totals = useMemo(() => {
    const acc = { inicial: 0, creditado: 0, gasto: 0, disponivel: 0, pendente: 0, aprovada: 0, paga: 0 };
    for (const r of visible) {
      acc.inicial += r.inicial;
      acc.creditado += r.creditado;
      acc.gasto += r.gasto;
      acc.disponivel += r.disponivel;
      acc.pendente += r.pendente;
      acc.aprovada += r.aprovada;
      acc.paga += r.paga;
    }
    return acc;
  }, [visible]);

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n: number) => n.toFixed(2).replace(".", ",");
    const header = [
      t("hr:beneficios.table.collaborator"),
      t("hr:beneficios.balance.initial"),
      t("hr:beneficios.balance.credited"),
      t("hr:beneficios.balance.spent"),
      t("hr:beneficios.overview.remaining"),
      t("hr:beneficios.status.pendente"),
      t("hr:beneficios.status.aprovada"),
      t("hr:beneficios.status.paga"),
    ];
    const lines = [header.join(";")].concat(
      visible.map((r) =>
        [r.nome, num(r.inicial), num(r.creditado), num(r.gasto), num(r.disponivel), num(r.pendente), num(r.aprovada), num(r.paga)]
          .map(esc)
          .join(";"),
      ),
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beneficios-saldos-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entitlement = (r: Row) => r.inicial + r.creditado;
  const pct = (r: Row) => {
    const e = entitlement(r);
    if (e <= 0) return r.gasto > 0 ? 100 : 0;
    return Math.min(100, Math.round((r.gasto / e) * 100));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("hr:beneficios.balance.initial")} value={totals.inicial} />
        <StatCard label={t("hr:beneficios.balance.credited")} value={totals.creditado} />
        <StatCard
          label={t("hr:beneficios.balance.spent")}
          value={totals.gasto}
          hint={`${t("hr:beneficios.status.pendente")} ${fmtEUR(totals.pendente)} · ${t("hr:beneficios.status.aprovada")} ${fmtEUR(totals.aprovada)} · ${t("hr:beneficios.status.paga")} ${fmtEUR(totals.paga)}`}
        />
        <StatCard
          label={t("hr:beneficios.overview.remaining")}
          value={totals.disponivel}
          className={totals.disponivel < 0 ? "border-rose-300" : "border-emerald-200"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("hr:beneficios.overview.searchPlaceholder")}
          className="h-9 w-full sm:w-64"
        />
        <Select
          value={String(year)}
          onValueChange={(v) => setYear(v === "all" ? "all" : Number(v))}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hr:beneficios.filters.allYears")}</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("hr:beneficios.overview.sortName")}</SelectItem>
            <SelectItem value="spent">{t("hr:beneficios.overview.sortSpent")}</SelectItem>
            <SelectItem value="remaining">{t("hr:beneficios.overview.sortRemaining")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={includeArchived ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIncludeArchived((v) => !v)}
        >
          {t("hr:beneficios.overview.includeArchived")}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
          <Download className="h-4 w-4" /> {t("hr:beneficios.filters.exportCsv")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t("hr:beneficios.table.collaborator")}</TableHead>
                <TableHead className="text-right">{t("hr:beneficios.balance.initial")}</TableHead>
                <TableHead className="text-right">{t("hr:beneficios.balance.credited")}</TableHead>
                <TableHead className="text-right">{t("hr:beneficios.balance.spent")}</TableHead>
                <TableHead className="text-right">{t("hr:beneficios.overview.remaining")}</TableHead>
                <TableHead className="w-[160px]">{t("hr:beneficios.overview.usage")}</TableHead>
                <TableHead className="text-right">{t("hr:beneficios.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    {t("common:loading")}
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    {t("hr:beneficios.overview.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => {
                  const open = expanded === r.id;
                  const over = r.disponivel < 0;
                  return (
                    <Fragment key={r.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded(open ? null : r.id)}
                      >
                        <TableCell className="pr-0">
                          {open ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CollaboratorAvatar
                              collaboratorId={r.id}
                              fotoPath={r.foto_path}
                              name={r.nome}
                            />
                            <span className="font-medium">{r.nome}</span>
                            {r.archived && (
                              <Badge variant="outline" className="text-[10px]">
                                {t("hr:beneficios.overview.archived")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEUR(r.inicial)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEUR(r.creditado)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEUR(r.gasto)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            over ? "text-rose-600" : "text-emerald-700",
                          )}
                        >
                          {fmtEUR(r.disponivel)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={pct(r)}
                              className={cn("h-2", over && "[&>div]:bg-rose-500")}
                            />
                            <span className="w-9 text-right text-xs text-muted-foreground">
                              {pct(r)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {onViewExpenses && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={t("hr:beneficios.overview.viewExpenses")}
                                onClick={() => onViewExpenses(r.id)}
                              >
                                <Receipt className="h-4 w-4" />
                              </Button>
                            )}
                            {onManageBalances && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={t("hr:beneficios.overview.manageBalances")}
                                onClick={() => onManageBalances(r.id)}
                              >
                                <Settings2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={7} className="py-3">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              {CATS.map((cat) => {
                                const b = r.byCat[cat];
                                if (!b.inicial && !b.creditado && !b.gasto) return null;
                                return (
                                  <div key={cat} className="rounded-md border bg-background p-3">
                                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                                      {CATEGORY_LABELS[cat]}
                                    </div>
                                    <DetailLine label={t("hr:beneficios.balance.initial")} value={b.inicial} />
                                    <DetailLine label={t("hr:beneficios.balance.credited")} value={b.creditado} />
                                    <DetailLine label={t("hr:beneficios.balance.spent")} value={b.gasto} />
                                    <DetailLine
                                      label={t("hr:beneficios.overview.remaining")}
                                      value={b.disponivel}
                                      strong
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong && "font-semibold",
          strong && value < 0 && "text-rose-600",
        )}
      >
        {fmtEUR(value)}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: number;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-2", className)}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{fmtEUR(value)}</CardTitle>
        {hint && <p className="pt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
