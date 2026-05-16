import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Plus,
  Wallet,
  Camera,
  Check,
  X,
  BadgeEuro,
  Trash2,
  FileImage,
  Settings2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { fmtEUR, type Snapshot, type Collaborator } from "@/lib/salary";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  budgetsFromSnapshot,
  balanceByCategory,
  expenseCategoryLabel,
  type BenefitCategory,
  type BenefitCategoryRow,
  type BenefitExpenseRow,
  type ExpenseStatus,
  type BenefitBalance,
  type BenefitYearlyCredit,
} from "@/lib/benefits";
import { cn } from "@/lib/utils";
import { BenefitExpenseTimeline } from "@/components/hr/BenefitExpenseTimeline";
import { RejectExpenseDialog } from "@/components/hr/RejectExpenseDialog";
import { DeleteExpenseDialog } from "@/components/hr/DeleteExpenseDialog";
import { ExpenseFilterBar, type ExpenseFilterState } from "@/components/hr/ExpenseFilterBar";

// As novas tabelas ainda não estão totalmente nos types — usamos `as any` pontualmente.
// É seguro porque as RLS policies controlam o acesso.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const CATS: BenefitCategory[] = ["carro", "ticket", "premio", "outros"];

// Hook para carregar as categorias dinâmicas activas.
function useBenefitCategories() {
  return useQuery({
    queryKey: ["benefit-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefit_categories")
        .select("id, code, label_pt, label_en, icon, legacy_enum, sort_order, active")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as BenefitCategoryRow[];
    },
  });
}

import { PermissionGate } from "@/components/PermissionGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyPermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_app/hr/beneficios")({
  component: () => (
    <PermissionGate permission="hr.beneficios.own">
      <BeneficiosPage />
    </PermissionGate>
  ),
});

function BeneficiosPage() {
  const { isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const canApprove = permissions.has("hr.beneficios.approve");
  const { t } = useTranslation(["hr"]);

  if (isAdmin) return <AdminView />;
  if (canApprove) {
    return (
      <Tabs defaultValue="mine" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mine">{t("hr:beneficios.tabs.mine")}</TabsTrigger>
          <TabsTrigger value="approvals">{t("hr:beneficios.tabs.approvals")}</TabsTrigger>
        </TabsList>
        <TabsContent value="mine" className="space-y-6">
          <CollaboratorView />
        </TabsContent>
        <TabsContent value="approvals" className="space-y-6">
          <ApproverView />
        </TabsContent>
      </Tabs>
    );
  }
  return <CollaboratorView />;
}

// =============================================================
// Vista do colaborador
// =============================================================
function CollaboratorView() {
  const qc = useQueryClient();
  const { t } = useTranslation(["hr", "common"]);

  const { data: myCollab, isLoading: loadingCollab } = useQuery({
    queryKey: ["my-collaborator"],
    queryFn: async () => {
      const { data: idData, error: idErr } = await supabase.rpc("get_my_collaborator_id");
      if (idErr) throw idErr;
      if (!idData) return null;
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .eq("id", idData)
        .maybeSingle();
      if (error) throw error;
      return data as Collaborator | null;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wallet className="h-6 w-6" /> {t("hr:beneficios.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("hr:beneficios.subtitle")}</p>
      </div>

      {loadingCollab ? (
        <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
      ) : !myCollab ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("hr:beneficios.empty.noProfile")}
          </CardContent>
        </Card>
      ) : (
        <CollaboratorBody collaborator={myCollab} onChanged={() => qc.invalidateQueries()} />
      )}
    </div>
  );
}

function useBenefitData(collaboratorId: string | null) {
  const balancesQ = useQuery({
    queryKey: ["benefit-balances", collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("benefit_balances")
        .select("*")
        .eq("collaborator_id", collaboratorId!);
      if (error) throw error;
      return (data ?? []) as unknown as BenefitBalance[];
    },
  });

  const creditsQ = useQuery({
    queryKey: ["benefit-credits", collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("benefit_yearly_credits")
        .select("*")
        .eq("collaborator_id", collaboratorId!)
        .order("ano_fiscal", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BenefitYearlyCredit[];
    },
  });

  const expensesQ = useQuery({
    queryKey: ["benefit-expenses-all", collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("benefit_expenses_v")
        .select("*")
        .eq("collaborator_id", collaboratorId!)
        .order("data_despesa", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BenefitExpenseRow[];
    },
  });

  return { balancesQ, creditsQ, expensesQ };
}

// ---- Helpers partilhados ----

function exportExpensesCsv(
  rows: BenefitExpenseRow[],
  filename: string,
  i18n: {
    headers: string[];
    status: (s: ExpenseStatus) => string;
    categoryLabel: (e: BenefitExpenseRow) => string;
  },
) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [i18n.headers.join(";")].concat(
    rows.map((r) =>
      [
        r.data_despesa,
        i18n.categoryLabel(r),
        r.descricao,
        Number(r.valor).toFixed(2).replace(".", ","),
        i18n.status(r.estado),
        r.notas_colaborador ?? "",
        r.notas_aprovacao ?? "",
      ]
        .map(esc)
        .join(";"),
    ),
  );
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function filterExpenses(
  rows: BenefitExpenseRow[],
  opts: { search: string; estado: ExpenseStatus | "todos"; categoryCode: string | "all"; year: number | "all" },
): BenefitExpenseRow[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (opts.estado !== "todos" && r.estado !== opts.estado) return false;
    if (opts.year !== "all" && r.ano_fiscal !== opts.year) return false;
    if (opts.categoryCode !== "all") {
      const code = r.category_code ?? "";
      if (code !== opts.categoryCode) return false;
    }
    if (q) {
      const hay = `${r.descricao} ${r.notas_colaborador ?? ""} ${r.notas_aprovacao ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function CollaboratorBody({
  collaborator,
  onChanged,
}: {
  collaborator: Collaborator;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation(["hr"]);
  const isEn = i18n.language?.startsWith("en");
  const ano = collaborator.ano_fiscal;
  const { balancesQ, creditsQ, expensesQ } = useBenefitData(collaborator.id);
  const { data: categoriesRows = [] } = useBenefitCategories();

  const balances = balancesQ.data ?? [];
  const credits = creditsQ.data ?? [];
  const expenses = expensesQ.data ?? [];

  const balance = useMemo(
    () => balanceByCategory({ balances, credits, expenses }),
    [balances, credits, expenses],
  );

  const cats = CATS.filter(
    (c) => balance[c].inicial > 0 || balance[c].creditado > 0 || balance[c].gasto > 0,
  );
  const hasAny = cats.length > 0;

  // Filtros
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<ExpenseStatus | "todos">("todos");
  const [categoryCode, setCategoryCode] = useState<string | "all">("all");
  const years = useMemo(() => {
    const s = new Set<number>(expenses.map((e) => e.ano_fiscal));
    s.add(ano);
    return Array.from(s).sort((a, b) => b - a);
  }, [expenses, ano]);
  const [year, setYear] = useState<number | "all">(ano);

  const filtered = useMemo(
    () => filterExpenses(expenses, { search, estado, categoryCode, year }),
    [expenses, search, estado, categoryCode, year],
  );

  const yearScope = useMemo(
    () => (year === "all" ? expenses : expenses.filter((e) => e.ano_fiscal === year)),
    [expenses, year],
  );
  const yearTotals = useMemo(() => {
    const tt = { submetido: 0, aprovado: 0, pago: 0, rejeitado: 0 };
    for (const e of yearScope) {
      const v = Number(e.valor) || 0;
      if (e.estado === "rejeitada") tt.rejeitado += v;
      else tt.submetido += v;
      if (e.estado === "aprovada" || e.estado === "paga") tt.aprovado += v;
      if (e.estado === "paga") tt.pago += v;
    }
    return tt;
  }, [yearScope]);

  const refetchAll = () => {
    balancesQ.refetch();
    creditsQ.refetch();
    expensesQ.refetch();
    onChanged();
  };

  if (!hasAny) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("hr:beneficios.empty.noBalance")}
        </CardContent>
      </Card>
    );
  }

  const csvI18n = {
    headers: [
      t("hr:beneficios.csv.headers.date"),
      t("hr:beneficios.csv.headers.category"),
      t("hr:beneficios.csv.headers.description"),
      t("hr:beneficios.csv.headers.amountEur"),
      t("hr:beneficios.csv.headers.status"),
      t("hr:beneficios.csv.headers.collaboratorNotes"),
      t("hr:beneficios.csv.headers.approvalNotes"),
    ],
    status: (s: ExpenseStatus) => t(`hr:beneficios.status.${s}`),
    categoryLabel: (e: BenefitExpenseRow) =>
      expenseCategoryLabel(e, isEn ? "en" : "pt"),
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cats.map((c) => {
          const b = balance[c];
          const tecto = b.inicial + b.creditado;
          const pct = tecto > 0 ? Math.min(100, (b.gasto / tecto) * 100) : 0;
          return (
            <Card key={c}>
              <CardHeader className="pb-3">
                <CardDescription>{t(`hr:beneficios.legacyCategory.${c}`)}</CardDescription>
                <CardTitle className={cn("text-xl", b.disponivel < 0 && "text-rose-600")}>
                  {fmtEUR(b.disponivel)}
                </CardTitle>
                <div className="text-xs text-muted-foreground">{t("hr:beneficios.balance.available")}</div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={pct} />
                <div className="grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                  <div>
                    <div>{t("hr:beneficios.balance.initial")}</div>
                    <div className="font-medium text-foreground">{fmtEUR(b.inicial)}</div>
                  </div>
                  <div>
                    <div>{t("hr:beneficios.balance.credited")}</div>
                    <div className="font-medium text-foreground">{fmtEUR(b.creditado)}</div>
                  </div>
                  <div>
                    <div>{t("hr:beneficios.balance.spent")}</div>
                    <div className="font-medium text-foreground">{fmtEUR(b.gasto)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("hr:beneficios.historyHeader")}</h2>
        <SubmitExpenseDialog
          collaboratorId={collaborator.id}
          anoFiscal={ano}
          balance={balance}
          categories={categoriesRows}
          onCreated={refetchAll}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <YearTile label={t("hr:beneficios.summary.submitted")} value={yearTotals.submetido} />
        <YearTile label={t("hr:beneficios.summary.approved")} value={yearTotals.aprovado} tone="emerald" />
        <YearTile label={t("hr:beneficios.summary.paid")} value={yearTotals.pago} tone="sky" />
        <YearTile label={t("hr:beneficios.summary.rejected")} value={yearTotals.rejeitado} tone="rose" />
      </div>

      <ExpenseFilterBar
        value={{ search, estado, categoryCode, year }}
        onChange={(next) => {
          setSearch(next.search);
          setEstado(next.estado);
          setCategoryCode(next.categoryCode);
          setYear(next.year);
        }}
        categories={categoriesRows}
        years={years}
        onExportCsv={() =>
          exportExpensesCsv(filtered, `beneficios-${collaborator.nome}-${year}.csv`, csvI18n)
        }
        exportDisabled={filtered.length === 0}
      />

      <ExpensesTable expenses={filtered} canEdit isAdmin={false} onChanged={refetchAll} />
    </div>
  );
}

function YearTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "sky" | "rose";
}) {
  const colorMap = {
    emerald: "text-emerald-700",
    sky: "text-sky-700",
    rose: "text-rose-700",
  } as const;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className={cn("text-lg", tone && colorMap[tone])}>{fmtEUR(value)}</CardTitle>
      </CardHeader>
    </Card>
  );
}

// =============================================================
// Dialog de submissão
// =============================================================
function SubmitExpenseDialog({
  collaboratorId,
  anoFiscal,
  balance,
  categories,
  onCreated,
}: {
  collaboratorId: string;
  anoFiscal: number;
  balance: Record<BenefitCategory, { disponivel: number }>;
  categories: BenefitCategoryRow[];
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation(["hr"]);
  const isEn = i18n.language?.startsWith("en");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    categoryId: "",
    descricao: "",
    valor: "",
    data_despesa: new Date().toISOString().slice(0, 10),
    notas_colaborador: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setForm({
      categoryId: "",
      descricao: "",
      valor: "",
      data_despesa: new Date().toISOString().slice(0, 10),
      notas_colaborador: "",
    });
    setFile(null);
  };

  const valorNum = Number(form.valor.replace(",", ".")) || 0;
  const selectedCategory = categories.find((c) => c.id === form.categoryId) ?? null;
  const legacyForSelected: BenefitCategory | null = selectedCategory?.legacy_enum ?? null;
  const restante = legacyForSelected ? balance[legacyForSelected].disponivel : null;
  const excede = restante != null && valorNum > restante;

  async function submit() {
    if (!selectedCategory) return toast.error(t("hr:beneficios.toasts.errors.categoryRequired"));
    if (!form.descricao.trim()) return toast.error(t("hr:beneficios.toasts.errors.descriptionRequired"));
    if (valorNum <= 0) return toast.error(t("hr:beneficios.toasts.errors.invalidAmount"));
    if (!file) return toast.error(t("hr:beneficios.toasts.errors.receiptRequired"));

    setSubmitting(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${collaboratorId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("benefit-receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      // Dual-write: legacy enum (fallback "outros") + new category_id
      const legacy: BenefitCategory = selectedCategory.legacy_enum ?? "outros";
      const { error } = await sb.from("benefit_expenses").insert({
        collaborator_id: collaboratorId,
        ano_fiscal: anoFiscal,
        categoria: legacy,
        category_id: selectedCategory.id,
        descricao: form.descricao.trim(),
        valor: valorNum,
        data_despesa: form.data_despesa,
        notas_colaborador: form.notas_colaborador.trim() || null,
        foto_path: path,
      });
      if (error) throw error;

      toast.success(t("hr:beneficios.toasts.submitted"));
      reset();
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hr:beneficios.toasts.errors.submit"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t("hr:beneficios.submit.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hr:beneficios.submit.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("hr:beneficios.submit.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>{t("hr:beneficios.submit.category")} *</Label>
            <Select
              value={form.categoryId}
              onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            >
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder={t("hr:beneficios.submit.categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {categories.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {t("hr:beneficios.empty.noExpenses")}
                  </div>
                ) : (
                  categories.map((c) => {
                    const av = c.legacy_enum ? balance[c.legacy_enum].disponivel : null;
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {isEn ? c.label_en : c.label_pt}
                        {av != null
                          ? ` — ${t("hr:beneficios.submit.categoryAvailable", { value: fmtEUR(av) })}`
                          : ""}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>{t("hr:beneficios.submit.description")} *</Label>
            <Input
              className="input-yellow"
              placeholder={t("hr:beneficios.submit.descriptionPlaceholder")}
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("hr:beneficios.submit.amount")} *</Label>
            <Input
              className="input-yellow"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
            />
            {restante != null && (
              <div
                className={cn(
                  "text-[11px]",
                  excede ? "text-rose-600" : "text-muted-foreground",
                )}
              >
                {excede
                  ? t("hr:beneficios.submit.exceeds", { value: fmtEUR(restante) })
                  : t("hr:beneficios.submit.available", { value: fmtEUR(restante) })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("hr:beneficios.submit.date")} *</Label>
            <Input
              type="date"
              className="input-yellow"
              value={form.data_despesa}
              onChange={(e) => setForm((f) => ({ ...f, data_despesa: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>{t("hr:beneficios.submit.receipt")} *</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Camera className="h-3 w-3" /> {file.name}
              </div>
            )}
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>{t("hr:beneficios.submit.notes")}</Label>
            <Textarea
              rows={2}
              value={form.notas_colaborador}
              onChange={(e) => setForm((f) => ({ ...f, notas_colaborador: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("hr:beneficios.submit.cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? t("hr:beneficios.submit.submitting") : t("hr:beneficios.submit.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Tabela de despesas (partilhada)
// =============================================================
function ExpensesTable({
  expenses,
  canEdit,
  isAdmin,
  showCollaborator,
  collaboratorsById,
  onChanged,
}: {
  expenses: BenefitExpenseRow[];
  canEdit: boolean;
  isAdmin: boolean;
  showCollaborator?: boolean;
  collaboratorsById?: Record<string, Collaborator>;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation(["hr"]);
  const isEn = i18n.language?.startsWith("en");
  const dateLocale = isEn ? "en-GB" : "pt-PT";

  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("hr:beneficios.empty.noExpenses")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("hr:beneficios.table.date")}</TableHead>
              {showCollaborator && <TableHead>{t("hr:beneficios.table.collaborator")}</TableHead>}
              <TableHead>{t("hr:beneficios.table.category")}</TableHead>
              <TableHead>{t("hr:beneficios.table.description")}</TableHead>
              <TableHead className="text-right">{t("hr:beneficios.table.amount")}</TableHead>
              <TableHead>{t("hr:beneficios.table.status")}</TableHead>
              <TableHead className="text-right">{t("hr:beneficios.table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {new Date(e.data_despesa).toLocaleDateString(dateLocale)}
                </TableCell>
                {showCollaborator && (
                  <TableCell className="text-sm">
                    {collaboratorsById?.[e.collaborator_id]?.nome ?? "—"}
                  </TableCell>
                )}
                <TableCell className="text-sm">
                  <Badge variant="outline" className="font-normal">
                    {expenseCategoryLabel(e, isEn ? "en" : "pt")}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[280px] truncate text-sm" title={e.descricao}>
                  {e.descricao}
                </TableCell>
                <TableCell className="text-right font-medium">{fmtEUR(e.valor)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("border whitespace-nowrap", STATUS_COLORS[e.estado])}>
                    {t(`hr:beneficios.status.${e.estado}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ExpenseActions
                    expense={e}
                    canEdit={canEdit}
                    isAdmin={isAdmin}
                    onChanged={onChanged}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ExpenseActions({
  expense,
  canEdit,
  isAdmin,
  onChanged,
}: {
  expense: BenefitExpenseRow;
  canEdit: boolean;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function viewPhoto() {
    if (!expense.foto_path) return;
    setLoadingUrl(true);
    try {
      const { data, error } = await supabase.storage
        .from("benefit-receipts")
        .createSignedUrl(expense.foto_path, 60 * 5);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir foto");
    } finally {
      setLoadingUrl(false);
    }
  }

  async function setStatus(to: ExpenseStatus, notes?: string | null) {
    const { error } = await sb.rpc("benefit_expense_set_status", {
      _expense_id: expense.id,
      _to_status: to,
      _notes: notes ?? null,
    });
    if (error) {
      toast.error(error.message);
      throw error;
    }
  }

  async function approve() {
    try {
      await setStatus("aprovada", null);
    } catch {
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      await fetch("/api/notify-expense", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ expenseId: expense.id }),
      });
    } catch {
      /* ignora */
    }

    toast.success("Despesa aprovada — email enviado para contabilidade");
    onChanged();
  }

  async function confirmReject(reason: string) {
    await setStatus("rejeitada", reason);
    toast.success("Despesa rejeitada — saldo devolvido");
    onChanged();
  }

  async function markPaid() {
    try {
      await setStatus("paga");
    } catch {
      return;
    }
    toast.success("Marcada como paga");
    onChanged();
  }

  async function remove() {
    // Storage cleanup is best-effort; RLS still allows owner to delete
    // their own foto when expense is `pendente` (preserved behavior).
    if (expense.foto_path) {
      await supabase.storage.from("benefit-receipts").remove([expense.foto_path]);
    }
    const { error } = await supabase.from("benefit_expenses").delete().eq("id", expense.id);
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success("Despesa apagada");
    onChanged();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setDetailOpen(true)} title="Detalhes">
        <Info className="h-4 w-4" />
      </Button>
      {expense.foto_path && (
        <Button size="sm" variant="ghost" onClick={viewPhoto} disabled={loadingUrl} title="Ver factura">
          <FileImage className="h-4 w-4" />
        </Button>
      )}
      {isAdmin && expense.estado === "pendente" && (
        <>
          <Button size="sm" variant="ghost" onClick={approve} title="Aprovar">
            <Check className="h-4 w-4 text-emerald-600" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejectOpen(true)} title="Rejeitar">
            <X className="h-4 w-4 text-rose-600" />
          </Button>
        </>
      )}
      {isAdmin && expense.estado === "aprovada" && (
        <Button size="sm" variant="ghost" onClick={markPaid} title="Marcar como paga">
          <BadgeEuro className="h-4 w-4 text-sky-600" />
        </Button>
      )}
      {(isAdmin || (canEdit && expense.estado === "pendente")) && (
        <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(true)} title="Apagar">
          <Trash2 className="h-4 w-4 text-rose-600" />
        </Button>
      )}

      <RejectExpenseDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={confirmReject}
      />

      <DeleteExpenseDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={remove}
        description={
          expense.estado === "pendente"
            ? "Esta acção é permanente. A despesa pendente e a respectiva factura serão removidas."
            : "Esta acção é permanente. A despesa e a respectiva factura serão removidas."
        }
      />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da despesa</DialogTitle>
            <DialogDescription>
              {expenseCategoryLabel(expense)} · {fmtEUR(Number(expense.valor))} ·{" "}
              <Badge variant="outline" className={cn("border", STATUS_COLORS[expense.estado])}>
                {STATUS_LABELS[expense.estado]}
              </Badge>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Descrição</div>
              <div>{expense.descricao}</div>
            </div>
            {expense.notas_colaborador && (
              <div>
                <div className="text-xs text-muted-foreground">Notas do colaborador</div>
                <div className="whitespace-pre-wrap">{expense.notas_colaborador}</div>
              </div>
            )}
            {expense.notas_aprovacao && (
              <div>
                <div className="text-xs text-muted-foreground">Notas de aprovação</div>
                <div className="whitespace-pre-wrap">{expense.notas_aprovacao}</div>
              </div>
            )}
            <div className="border-t pt-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Histórico</div>
              <BenefitExpenseTimeline expenseId={expense.id} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================
// Vista do aprovador (colaborador com permissão hr.beneficios.approve)
// =============================================================
function ApproverView() {
  const qc = useQueryClient();
  return (
    <ManagementView
      title="Aprovações de despesas"
      subtitle="Reveja as facturas submetidas pelos colaboradores e aprove ou rejeite."
      queryKey="approver-expenses"
      onInvalidate={() => qc.invalidateQueries()}
    />
  );
}

// =============================================================
// Vista admin
// =============================================================
function AdminView() {
  const qc = useQueryClient();
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .is("archived_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Collaborator[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wallet className="h-6 w-6" /> Benefícios — Gestão
          </h1>
          <p className="text-sm text-muted-foreground">
            Aprove despesas e faça a gestão dos saldos e créditos anuais por colaborador.
          </p>
        </div>
        <ManageBalancesDialog collaborators={collaborators} />
      </div>
      <ManagementView
        title=""
        subtitle=""
        queryKey="all-expenses"
        onInvalidate={() => qc.invalidateQueries()}
        hideHeader
      />
    </div>
  );
}

// Shared filter+table component for approver/admin views.
// Reuses the same `ExpenseFilterBar` + `filterExpenses` helpers as
// the collaborator view to keep behavior consistent.
function ManagementView({
  title,
  subtitle,
  queryKey,
  onInvalidate,
  hideHeader,
}: {
  title: string;
  subtitle: string;
  queryKey: string;
  onInvalidate: () => void;
  hideHeader?: boolean;
}) {
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators", "active-mgmt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .is("archived_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Collaborator[];
    },
  });
  const { data: categoriesRows = [] } = useBenefitCategories();

  const { data: expenses = [], refetch } = useQuery({
    queryKey: [queryKey, "all"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("benefit_expenses_v")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BenefitExpenseRow[];
    },
  });

  const collaboratorsById = useMemo(() => {
    const map: Record<string, Collaborator> = {};
    for (const c of collaborators) map[c.id] = c;
    return map;
  }, [collaborators]);

  const currentYear = new Date().getFullYear();
  const [filters, setFilters] = useState<ExpenseFilterState>({
    search: "",
    estado: "pendente",
    categoryCode: "all",
    year: "all",
  });
  const years = useMemo(() => {
    const s = new Set<number>(expenses.map((e) => e.ano_fiscal));
    s.add(currentYear);
    return Array.from(s).sort((a, b) => b - a);
  }, [expenses, currentYear]);

  const filtered = useMemo(
    () => filterExpenses(expenses, filters),
    [expenses, filters],
  );

  const totals = useMemo(() => {
    const t = { pendente: 0, aprovada: 0, paga: 0 };
    for (const e of expenses) {
      if (e.estado === "rejeitada") continue;
      t[e.estado as "pendente" | "aprovada" | "paga"] += Number(e.valor) || 0;
    }
    return t;
  }, [expenses]);

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Check className="h-5 w-5" /> {title}
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Pendentes" value={totals.pendente} className="border-amber-200" />
        <SummaryCard label="Aprovadas" value={totals.aprovada} className="border-emerald-200" />
        <SummaryCard label="Pagas" value={totals.paga} className="border-sky-200" />
      </div>

      <ExpenseFilterBar
        value={filters}
        onChange={setFilters}
        categories={categoriesRows}
        years={years}
        showChips
        onExportCsv={() =>
          exportExpensesCsv(filtered, `beneficios-gestao-${filters.year}.csv`)
        }
        exportDisabled={filtered.length === 0}
      />

      <ExpensesTable
        expenses={filtered}
        canEdit={false}
        isAdmin
        showCollaborator
        collaboratorsById={collaboratorsById}
        onChanged={() => {
          refetch();
          onInvalidate();
        }}
      />
    </div>
  );
}
function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <Card className={cn("border-2", className)}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{fmtEUR(value)}</CardTitle>
      </CardHeader>
    </Card>
  );
}

// =============================================================
// Admin: gestão de saldos iniciais e créditos anuais
// =============================================================
function ManageBalancesDialog({ collaborators }: { collaborators: Collaborator[] }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings2 className="h-4 w-4" /> Gerir saldos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Saldos e créditos anuais</DialogTitle>
          <DialogDescription>
            Defina o saldo inicial e os créditos por ano fiscal de cada colaborador. Sobras
            transitam automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Colaborador</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um colaborador…" />
            </SelectTrigger>
            <SelectContent>
              {collaborators.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedId && (
          <CollaboratorBalanceEditor
            collaborator={collaborators.find((c) => c.id === selectedId)!}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CollaboratorBalanceEditor({ collaborator }: { collaborator: Collaborator }) {
  const qc = useQueryClient();
  const { balancesQ, creditsQ } = useBenefitData(collaborator.id);

  const { data: snapshot } = useQuery({
    queryKey: ["effective-snapshot", collaborator.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_snapshots")
        .select("*")
        .eq("collaborator_id", collaborator.id)
        .eq("is_effective", true)
        .order("reference_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Snapshot | null;
    },
  });

  const fichaBudgets = useMemo(() => budgetsFromSnapshot(snapshot), [snapshot]);

  const balances = balancesQ.data ?? [];
  const credits = creditsQ.data ?? [];

  const balanceByCat = useMemo(() => {
    const m = {} as Record<BenefitCategory, BenefitBalance | undefined>;
    for (const b of balances) m[b.categoria] = b;
    return m;
  }, [balances]);

  async function setBalance(cat: BenefitCategory, valor: number) {
    const existing = balanceByCat[cat];
    const payload = {
      collaborator_id: collaborator.id,
      categoria: cat,
      saldo_inicial: valor,
    };
    const { error } = existing
      ? await sb.from("benefit_balances").update(payload).eq("id", existing.id)
      : await sb.from("benefit_balances").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saldo inicial guardado");
    qc.invalidateQueries({ queryKey: ["benefit-balances", collaborator.id] });
  }

  async function upsertCredit(ano: number, cat: BenefitCategory, valor: number) {
    const existing = credits.find((c) => c.ano_fiscal === ano && c.categoria === cat);
    const payload = {
      collaborator_id: collaborator.id,
      ano_fiscal: ano,
      categoria: cat,
      valor,
    };
    const { error } = existing
      ? await sb.from("benefit_yearly_credits").update(payload).eq("id", existing.id)
      : await sb.from("benefit_yearly_credits").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(`Crédito ${ano} guardado`);
    qc.invalidateQueries({ queryKey: ["benefit-credits", collaborator.id] });
  }

  async function removeCredit(id: string) {
    if (!confirm("Apagar este crédito?")) return;
    const { error } = await sb.from("benefit_yearly_credits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Crédito apagado");
    qc.invalidateQueries({ queryKey: ["benefit-credits", collaborator.id] });
  }

  async function creditFromFicha() {
    const ano = collaborator.ano_fiscal;
    let n = 0;
    for (const c of CATS) {
      const valor = fichaBudgets[c] || 0;
      if (valor <= 0) continue;
      await upsertCredit(ano, c, valor);
      n++;
    }
    if (n === 0) toast.info("A ficha não tem benefícios atribuídos.");
  }

  // Anos existentes + ano corrente
  const anos = useMemo(() => {
    const set = new Set<number>(credits.map((c) => c.ano_fiscal));
    set.add(collaborator.ano_fiscal);
    return Array.from(set).sort((a, b) => b - a);
  }, [credits, collaborator.ano_fiscal]);

  return (
    <div className="space-y-6">
      {/* Saldo inicial */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Saldo inicial (uma vez)</h3>
        <p className="text-xs text-muted-foreground">
          Saldo já existente do colaborador antes da implementação deste sistema.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATS.map((c) => (
            <BalanceField
              key={c}
              label={CATEGORY_LABELS[c]}
              value={balanceByCat[c]?.saldo_inicial ?? 0}
              onSave={(v) => setBalance(c, v)}
            />
          ))}
        </div>
      </section>

      {/* Créditos anuais */}
      <section className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Créditos anuais</h3>
            <p className="text-xs text-muted-foreground">
              Valor creditado em cada ano. Por norma, igual ao da ficha do colaborador desse ano.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={creditFromFicha}>
            Creditar {collaborator.ano_fiscal} a partir da ficha
          </Button>
        </div>

        {anos.map((ano) => (
          <YearCreditRow
            key={ano}
            ano={ano}
            credits={credits.filter((c) => c.ano_fiscal === ano)}
            fichaBudgets={ano === collaborator.ano_fiscal ? fichaBudgets : null}
            onSave={(cat, valor) => upsertCredit(ano, cat, valor)}
            onRemove={removeCredit}
          />
        ))}
      </section>
    </div>
  );
}

function BalanceField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (v: number) => unknown;
}) {
  const [v, setV] = useState(String(value));
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        <Input
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSave(Number(v.replace(",", ".")) || 0)}
        >
          OK
        </Button>
      </div>
    </div>
  );
}

function YearCreditRow({
  ano,
  credits,
  fichaBudgets,
  onSave,
  onRemove,
}: {
  ano: number;
  credits: BenefitYearlyCredit[];
  fichaBudgets: Record<BenefitCategory, number> | null;
  onSave: (cat: BenefitCategory, valor: number) => unknown;
  onRemove: (id: string) => unknown;
}) {
  const byCat = useMemo(() => {
    const m = {} as Record<BenefitCategory, BenefitYearlyCredit | undefined>;
    for (const c of credits) m[c.categoria] = c;
    return m;
  }, [credits]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ano fiscal {ano}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATS.map((c) => {
          const existing = byCat[c];
          const sugestao = fichaBudgets?.[c] ?? 0;
          return (
            <div key={c} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{CATEGORY_LABELS[c]}</Label>
                {existing && (
                  <button
                    onClick={() => onRemove(existing.id)}
                    className="text-[10px] text-rose-600 hover:underline"
                  >
                    apagar
                  </button>
                )}
              </div>
              <BalanceField
                label=""
                value={existing?.valor ?? 0}
                onSave={(v) => onSave(c, v)}
              />
              {!existing && sugestao > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  Ficha: {fmtEUR(sugestao)}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
