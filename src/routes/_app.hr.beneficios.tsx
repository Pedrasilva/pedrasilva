import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Wallet, Camera, Check, X, BadgeEuro, Trash2, FileImage } from "lucide-react";
import { toast } from "sonner";
import { fmtEUR, type Snapshot, type Collaborator } from "@/lib/salary";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  budgetsFromSnapshot,
  consumedByCategory,
  type BenefitCategory,
  type BenefitExpense,
  type ExpenseStatus,
} from "@/lib/benefits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/hr/beneficios")({
  component: BeneficiosPage,
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

  // Collaborator do utilizador autenticado
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

function CollaboratorBody({
  collaborator,
  onChanged,
}: {
  collaborator: Collaborator;
  onChanged: () => void;
}) {
  const ano = collaborator.ano_fiscal;

  const { data: snapshot } = useQuery({
    queryKey: ["effective-snapshot", collaborator.id, ano],
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

  const { data: expenses = [], refetch } = useQuery({
    queryKey: ["expenses", collaborator.id, ano],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefit_expenses")
        .select("*")
        .eq("collaborator_id", collaborator.id)
        .eq("ano_fiscal", ano)
        .order("data_despesa", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BenefitExpense[];
    },
  });

  const budgets = useMemo(() => budgetsFromSnapshot(snapshot), [snapshot]);
  const consumed = useMemo(() => consumedByCategory(expenses), [expenses]);

  const cats: BenefitCategory[] = ["carro", "ticket", "premio", "outros"];
  const totalTecto = cats.reduce((s, c) => s + (budgets[c] || 0), 0);
  const hasAnyBudget = totalTecto > 0;

  if (!hasAnyBudget) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Não tem benefícios atribuídos no ano fiscal {ano}.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo dos saldos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cats.map((c) => {
          const tecto = budgets[c] || 0;
          if (tecto <= 0) return null;
          const used = consumed[c].total;
          const left = Math.max(0, tecto - used);
          const pct = Math.min(100, (used / tecto) * 100);
          return (
            <Card key={c}>
              <CardHeader className="pb-3">
                <CardDescription>{CATEGORY_LABELS[c]}</CardDescription>
                <CardTitle className="text-xl">{fmtEUR(left)}</CardTitle>
                <div className="text-xs text-muted-foreground">
                  Disponível de {fmtEUR(tecto)}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={pct} />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {consumed[c].pendente > 0 && (
                    <span>Pendente: {fmtEUR(consumed[c].pendente)}</span>
                  )}
                  {consumed[c].aprovada > 0 && (
                    <span>Aprovada: {fmtEUR(consumed[c].aprovada)}</span>
                  )}
                  {consumed[c].paga > 0 && <span>Paga: {fmtEUR(consumed[c].paga)}</span>}
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
          budgets={budgets}
          consumed={consumed}
          onCreated={() => {
            refetch();
            onChanged();
          }}
        />
      </div>

      <ExpensesTable expenses={expenses} canEdit isAdmin={false} onChanged={refetch} />
    </div>
  );
}

// =============================================================
// Dialog de submissão
// =============================================================
function SubmitExpenseDialog({
  collaboratorId,
  anoFiscal,
  budgets,
  consumed,
  onCreated,
}: {
  collaboratorId: string;
  anoFiscal: number;
  budgets: Record<BenefitCategory, number>;
  consumed: Record<BenefitCategory, { total: number }>;
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

  const availableCats = (["carro", "ticket", "premio", "outros"] as BenefitCategory[]).filter(
    (c) => (budgets[c] || 0) > 0,
  );

  const valorNum = Number(form.valor.replace(",", ".")) || 0;
  const cat = form.categoria as BenefitCategory | "";
  const tecto = cat ? budgets[cat] : 0;
  const usado = cat ? consumed[cat].total : 0;
  const restante = Math.max(0, tecto - usado);
  const excede = cat && valorNum > restante;

  async function submit() {
    if (!form.categoria) return toast.error("Escolha uma categoria");
    if (!form.descricao.trim()) return toast.error("Descrição obrigatória");
    if (valorNum <= 0) return toast.error("Valor inválido");
    if (!file) return toast.error("Anexe a foto/factura");

    setSubmitting(true);
    try {
      // Upload da foto
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${collaboratorId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("benefit-receipts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      // Insert na BD
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
                {availableCats.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]} — disponível {fmtEUR(Math.max(0, budgets[c] - consumed[c].total))}
                  </SelectItem>
                ))}
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  async function viewPhoto() {
    if (!expense.foto_path) return;
    setLoadingUrl(true);
    try {
      const { data, error } = await supabase.storage
        .from("benefit-receipts")
        .createSignedUrl(expense.foto_path, 60 * 5);
      if (error) throw error;
      setPhotoUrl(data.signedUrl);
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

    // Notificar contabilidade (best effort)
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
    toast.success("Despesa rejeitada");
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
    queryKey: ["collaborators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators").select("*").order("nome");
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
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wallet className="h-6 w-6" /> Benefícios — Gestão
        </h1>
        <p className="text-sm text-muted-foreground">
          Aprove, rejeite e marque como pagas as despesas submetidas pelos colaboradores.
        </p>
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
