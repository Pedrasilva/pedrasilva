import { useMemo, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { fmtEUR, type Snapshot, type Collaborator } from "@/lib/salary";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  budgetsFromSnapshot,
  balanceByCategory,
  type BenefitCategory,
  type BenefitExpense,
  type ExpenseStatus,
  type BenefitBalance,
  type BenefitYearlyCredit,
} from "@/lib/benefits";
import { cn } from "@/lib/utils";

// As novas tabelas ainda não estão no types.ts gerado — usamos `as any` para o cliente.
// É seguro porque as RLS policies controlam o acesso.
const sb = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
};

const CATS: BenefitCategory[] = ["carro", "ticket", "premio", "outros"];

import { PermissionGate } from "@/components/PermissionGate";

export const Route = createFileRoute("/_app/hr/beneficios")({
  component: () => (
    <PermissionGate permission="hr.beneficios.own">
      <BeneficiosPage />
    </PermissionGate>
  ),
});

function BeneficiosPage() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminView /> : <CollaboratorView />;
}

// =============================================================
// Vista do colaborador
// =============================================================
function CollaboratorView() {
  const qc = useQueryClient();

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
          <Wallet className="h-6 w-6" /> Os meus benefícios
        </h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o saldo disponível e submeta as suas facturas.
        </p>
      </div>

      {loadingCollab ? (
        <div className="text-sm text-muted-foreground">A carregar…</div>
      ) : !myCollab ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Não conseguimos identificar o seu perfil de colaborador. Contacte o administrador.
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
      const { data, error } = await supabase
        .from("benefit_expenses")
        .select("*")
        .eq("collaborator_id", collaboratorId!)
        .order("data_despesa", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BenefitExpense[];
    },
  });

  return { balancesQ, creditsQ, expensesQ };
}

function CollaboratorBody({
  collaborator,
  onChanged,
}: {
  collaborator: Collaborator;
  onChanged: () => void;
}) {
  const ano = collaborator.ano_fiscal;
  const { balancesQ, creditsQ, expensesQ } = useBenefitData(collaborator.id);

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
          Ainda não tem saldo de benefícios atribuído. Contacte o administrador.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo dos saldos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cats.map((c) => {
          const b = balance[c];
          const tecto = b.inicial + b.creditado;
          const pct = tecto > 0 ? Math.min(100, (b.gasto / tecto) * 100) : 0;
          return (
            <Card key={c}>
              <CardHeader className="pb-3">
                <CardDescription>{CATEGORY_LABELS[c]}</CardDescription>
                <CardTitle className={cn("text-xl", b.disponivel < 0 && "text-rose-600")}>
                  {fmtEUR(b.disponivel)}
                </CardTitle>
                <div className="text-xs text-muted-foreground">disponível</div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={pct} />
                <div className="grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                  <div>
                    <div>Inicial</div>
                    <div className="font-medium text-foreground">{fmtEUR(b.inicial)}</div>
                  </div>
                  <div>
                    <div>Creditado</div>
                    <div className="font-medium text-foreground">{fmtEUR(b.creditado)}</div>
                  </div>
                  <div>
                    <div>Gasto</div>
                    <div className="font-medium text-foreground">{fmtEUR(b.gasto)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Submissão + lista */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Histórico de despesas</h2>
        <SubmitExpenseDialog
          collaboratorId={collaborator.id}
          anoFiscal={ano}
          balance={balance}
          onCreated={refetchAll}
        />
      </div>

      <ExpensesTable expenses={expenses} canEdit isAdmin={false} onChanged={refetchAll} />
    </div>
  );
}

// =============================================================
// Dialog de submissão
// =============================================================
function SubmitExpenseDialog({
  collaboratorId,
  anoFiscal,
  balance,
  onCreated,
}: {
  collaboratorId: string;
  anoFiscal: number;
  balance: Record<BenefitCategory, { disponivel: number }>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    categoria: "" as BenefitCategory | "",
    descricao: "",
    valor: "",
    data_despesa: new Date().toISOString().slice(0, 10),
    notas_colaborador: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setForm({
      categoria: "",
      descricao: "",
      valor: "",
      data_despesa: new Date().toISOString().slice(0, 10),
      notas_colaborador: "",
    });
    setFile(null);
  };

  const availableCats = CATS.filter((c) => balance[c].disponivel > 0);

  const valorNum = Number(form.valor.replace(",", ".")) || 0;
  const cat = form.categoria as BenefitCategory | "";
  const restante = cat ? balance[cat].disponivel : 0;
  const excede = !!cat && valorNum > restante;

  async function submit() {
    if (!form.categoria) return toast.error("Escolha uma categoria");
    if (!form.descricao.trim()) return toast.error("Descrição obrigatória");
    if (valorNum <= 0) return toast.error("Valor inválido");
    if (!file) return toast.error("Anexe a foto/factura");

    setSubmitting(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${collaboratorId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("benefit-receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error } = await supabase.from("benefit_expenses").insert({
        collaborator_id: collaboratorId,
        ano_fiscal: anoFiscal,
        categoria: form.categoria as BenefitCategory,
        descricao: form.descricao.trim(),
        valor: valorNum,
        data_despesa: form.data_despesa,
        notas_colaborador: form.notas_colaborador.trim() || null,
        foto_path: path,
      });
      if (error) throw error;

      toast.success("Despesa submetida — aguarda aprovação");
      reset();
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao submeter");
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
          <Plus className="h-4 w-4" /> Submeter despesa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova despesa</DialogTitle>
          <DialogDescription>
            Anexe a foto da factura e indique a categoria do benefício.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Categoria *</Label>
            <Select
              value={form.categoria}
              onValueChange={(v) => setForm((f) => ({ ...f, categoria: v as BenefitCategory }))}
            >
              <SelectTrigger className="input-yellow">
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {availableCats.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Sem saldo disponível em nenhuma categoria
                  </div>
                ) : (
                  availableCats.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]} — disponível {fmtEUR(balance[c].disponivel)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição *</Label>
            <Input
              className="input-yellow"
              placeholder="Ex: Combustível Galp 12/03"
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Valor (€) *</Label>
            <Input
              className="input-yellow"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
            />
            {cat && (
              <div
                className={cn(
                  "text-[11px]",
                  excede ? "text-rose-600" : "text-muted-foreground",
                )}
              >
                {excede
                  ? `Excede o disponível (${fmtEUR(restante)})`
                  : `Disponível: ${fmtEUR(restante)}`}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Data da despesa *</Label>
            <Input
              type="date"
              className="input-yellow"
              value={form.data_despesa}
              onChange={(e) => setForm((f) => ({ ...f, data_despesa: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Foto / factura *</Label>
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
            <Label>Notas (opcional)</Label>
            <Textarea
              rows={2}
              value={form.notas_colaborador}
              onChange={(e) => setForm((f) => ({ ...f, notas_colaborador: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "A submeter…" : "Submeter"}
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
  expenses: (BenefitExpense & { collaborator?: { nome: string } })[];
  canEdit: boolean;
  isAdmin: boolean;
  showCollaborator?: boolean;
  collaboratorsById?: Record<string, Collaborator>;
  onChanged: () => void;
}) {
  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sem despesas registadas.
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
              <TableHead>Data</TableHead>
              {showCollaborator && <TableHead>Colaborador</TableHead>}
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acções</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {new Date(e.data_despesa).toLocaleDateString("pt-PT")}
                </TableCell>
                {showCollaborator && (
                  <TableCell className="text-sm">
                    {collaboratorsById?.[e.collaborator_id]?.nome ?? "—"}
                  </TableCell>
                )}
                <TableCell className="text-sm">{CATEGORY_LABELS[e.categoria]}</TableCell>
                <TableCell className="max-w-[280px] truncate text-sm" title={e.descricao}>
                  {e.descricao}
                </TableCell>
                <TableCell className="text-right font-medium">{fmtEUR(e.valor)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("border", STATUS_COLORS[e.estado])}>
                    {STATUS_LABELS[e.estado]}
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
  expense: BenefitExpense;
  canEdit: boolean;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [loadingUrl, setLoadingUrl] = useState(false);

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

  async function approve() {
    const notas = window.prompt("Notas de aprovação (opcional)") ?? "";
    const { error } = await supabase
      .from("benefit_expenses")
      .update({
        estado: "aprovada",
        notas_aprovacao: notas || null,
        aprovado_em: new Date().toISOString(),
      })
      .eq("id", expense.id);
    if (error) return toast.error(error.message);

    try {
      await fetch("/api/notify-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId: expense.id }),
      });
    } catch {
      /* ignora */
    }

    toast.success("Despesa aprovada — email enviado para contabilidade");
    onChanged();
  }

  async function reject() {
    const notas = window.prompt("Motivo da rejeição") ?? "";
    if (!notas) return;
    const { error } = await supabase
      .from("benefit_expenses")
      .update({
        estado: "rejeitada",
        notas_aprovacao: notas,
        aprovado_em: new Date().toISOString(),
      })
      .eq("id", expense.id);
    if (error) return toast.error(error.message);
    toast.success("Despesa rejeitada — saldo devolvido");
    onChanged();
  }

  async function markPaid() {
    const { error } = await supabase
      .from("benefit_expenses")
      .update({ estado: "paga", pago_em: new Date().toISOString() })
      .eq("id", expense.id);
    if (error) return toast.error(error.message);
    toast.success("Marcada como paga");
    onChanged();
  }

  async function remove() {
    if (!confirm("Apagar esta despesa?")) return;
    if (expense.foto_path) {
      await supabase.storage.from("benefit-receipts").remove([expense.foto_path]);
    }
    const { error } = await supabase.from("benefit_expenses").delete().eq("id", expense.id);
    if (error) return toast.error(error.message);
    toast.success("Apagada");
    onChanged();
  }

  return (
    <div className="flex items-center justify-end gap-1">
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
          <Button size="sm" variant="ghost" onClick={reject} title="Rejeitar">
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
        <Button size="sm" variant="ghost" onClick={remove} title="Apagar">
          <Trash2 className="h-4 w-4 text-rose-600" />
        </Button>
      )}
    </div>
  );
}

// =============================================================
// Vista admin
// =============================================================
function AdminView() {
  const qc = useQueryClient();
  const [filterEstado, setFilterEstado] = useState<ExpenseStatus | "todos">("pendente");

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

  const { data: expenses = [], refetch } = useQuery({
    queryKey: ["all-expenses", filterEstado],
    queryFn: async () => {
      let q = supabase
        .from("benefit_expenses")
        .select("*")
        .order("created_at", { ascending: false });
      if (filterEstado !== "todos") q = q.eq("estado", filterEstado);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BenefitExpense[];
    },
  });

  const collaboratorsById = useMemo(() => {
    const map: Record<string, Collaborator> = {};
    for (const c of collaborators) map[c.id] = c;
    return map;
  }, [collaborators]);

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

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Pendentes" value={totals.pendente} className="border-amber-200" />
        <SummaryCard label="Aprovadas" value={totals.aprovada} className="border-emerald-200" />
        <SummaryCard label="Pagas" value={totals.paga} className="border-sky-200" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label>Estado:</Label>
          <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v as ExpenseStatus | "todos")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovada">Aprovadas</SelectItem>
              <SelectItem value="paga">Pagas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
              <SelectItem value="todos">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ExpensesTable
        expenses={expenses}
        canEdit={false}
        isAdmin
        showCollaborator
        collaboratorsById={collaboratorsById}
        onChanged={() => {
          refetch();
          qc.invalidateQueries();
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
