import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type Collaborator,
  type Snapshot,
  defaultSnapshot,
  fmtDate,
} from "@/lib/salary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, BarChart3, Save, Printer } from "lucide-react";
import { toast } from "sonner";
import { SnapshotForm } from "@/components/SnapshotForm";
import { ResumoCompare } from "@/components/ResumoCompare";

export const Route = createFileRoute("/_app/colaborador/$id")({
  component: CollaboratorPage,
});

function CollaboratorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("");
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    label: "Proposto",
    reference_date: new Date().toISOString().slice(0, 10),
    is_effective: false,
    copyFrom: "",
  });

  const { data: collab } = useQuery({
    queryKey: ["collaborator", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Collaborator;
    },
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_snapshots")
        .select("*")
        .eq("collaborator_id", id)
        .order("reference_date", { ascending: true });
      if (error) throw error;
      return data as Snapshot[];
    },
  });

  const [draft, setDraft] = useState<Collaborator | null>(null);
  useEffect(() => {
    if (collab) setDraft(collab);
  }, [collab]);

  const isDirty = useMemo(() => {
    if (!collab || !draft) return false;
    return (
      draft.nome !== collab.nome ||
      (draft.numero_colaborador ?? "") !== (collab.numero_colaborador ?? "") ||
      (draft.email ?? "") !== (collab.email ?? "") ||
      draft.departamento !== collab.departamento ||
      (draft.situacao_contractual ?? "") !== (collab.situacao_contractual ?? "") ||
      (draft.data_nascimento ?? "") !== (collab.data_nascimento ?? "") ||
      (draft.inicio_carreira ?? "") !== (collab.inicio_carreira ?? "") ||
      (draft.margem_lucro_pct_override ?? null) !== (collab.margem_lucro_pct_override ?? null) ||
      draft.dias_ferias_anuais !== collab.dias_ferias_anuais ||
      draft.saldo_ferias_anterior !== collab.saldo_ferias_anterior
    );
  }, [collab, draft]);

  const updateCollab = useMutation({
    mutationFn: async (patch: Partial<Collaborator>) => {
      const { error } = await supabase.from("collaborators").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alterações guardadas");
      qc.invalidateQueries({ queryKey: ["collaborator", id] });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setField = <K extends keyof Collaborator>(k: K, v: Collaborator[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const handleSave = () => {
    if (!draft) return;
    updateCollab.mutate({
      nome: draft.nome,
      numero_colaborador: draft.numero_colaborador || null,
      email: draft.email?.trim().toLowerCase() || null,
      departamento: draft.departamento,
      situacao_contractual: draft.situacao_contractual || null,
      data_nascimento: draft.data_nascimento || null,
      inicio_carreira: draft.inicio_carreira || null,
      margem_lucro_pct_override: draft.margem_lucro_pct_override,
      dias_ferias_anuais: draft.dias_ferias_anuais,
      saldo_ferias_anterior: draft.saldo_ferias_anterior,
    });
  };

  const createSnap = useMutation({
    mutationFn: async () => {
      const base = newForm.copyFrom
        ? snapshots.find((s) => s.id === newForm.copyFrom)
        : null;
      const seed = base
        ? { ...base }
        : defaultSnapshot(id, newForm.label, newForm.is_effective);
      const payload = {
        ...seed,
        id: undefined as unknown as string,
        collaborator_id: id,
        label: newForm.label || "Ficha",
        reference_date: newForm.reference_date,
        is_effective: newForm.is_effective,
      };
      delete (payload as { id?: string }).id;
      const { data, error } = await supabase
        .from("salary_snapshots")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Snapshot;
    },
    onSuccess: (s) => {
      toast.success("Ficha criada");
      qc.invalidateQueries({ queryKey: ["snapshots", id] });
      setActiveTab(s.id);
      setNewOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCollab = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("collaborators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador removido");
      navigate({ to: "/" });
    },
  });

  if (!collab || !draft) return <div className="text-sm text-muted-foreground">A carregar…</div>;

  const tabValue = activeTab || (snapshots[0]?.id ?? "resumo");

  return (
    <div className="space-y-6 print-area">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground no-print">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{collab.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {collab.departamento} · {collab.numero_colaborador || "sem nº"} · {collab.situacao_contractual || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4" /> Eliminar colaborador
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar colaborador</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acção remove o colaborador e todas as suas fichas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteCollab.mutate()}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Dados do colaborador</CardTitle>
            <CardDescription>
              Campos a amarelo são editáveis. As alterações só são guardadas ao clicar em Guardar.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-xs text-muted-foreground">Alterações por guardar</span>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || updateCollab.isPending}
            >
              <Save className="h-4 w-4" />
              {updateCollab.isPending ? "A guardar…" : "Guardar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nome">
              <Input
                className="input-yellow"
                value={draft.nome}
                onChange={(e) => setField("nome", e.target.value)}
              />
            </Field>
            <Field label="Nº colaborador">
              <Input
                className="input-yellow"
                value={draft.numero_colaborador ?? ""}
                onChange={(e) => setField("numero_colaborador", e.target.value || null)}
              />
            </Field>
            <Field label="Departamento">
              <Select
                value={draft.departamento}
                onValueChange={(v) =>
                  setField("departamento", v as "Projecto" | "Backoffice")
                }
              >
                <SelectTrigger className="input-yellow">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Projecto">Equipa Projecto</SelectItem>
                  <SelectItem value="Backoffice">Equipa Backoffice</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Situação contractual">
              <Select
                value={draft.situacao_contractual ?? ""}
                onValueChange={(v) => setField("situacao_contractual", v || null)}
              >
                <SelectTrigger className="input-yellow">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Contrato sem termo">Contrato sem termo</SelectItem>
                  <SelectItem value="Contrato com termo">Contrato com termo</SelectItem>
                  <SelectItem value="Contrato de tempo indeterminado">
                    Contrato de tempo indeterminado
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de nascimento">
              <Input
                type="date"
                className="input-yellow"
                value={draft.data_nascimento ?? ""}
                onChange={(e) => setField("data_nascimento", e.target.value || null)}
              />
            </Field>
            <Field label="Início de carreira">
              <Input
                type="date"
                className="input-yellow"
                value={draft.inicio_carreira ?? ""}
                onChange={(e) => setField("inicio_carreira", e.target.value || null)}
              />
            </Field>
            <Field label="Email (login Google)">
              <Input
                type="email"
                placeholder="nome@empresa.com"
                className="input-yellow"
                value={draft.email ?? ""}
                onChange={(e) => setField("email", e.target.value || null)}
              />
            </Field>
            <Field label="Dias de férias / ano">
              <Input
                type="number"
                min={0}
                className="input-yellow tabular-nums"
                value={draft.dias_ferias_anuais ?? 22}
                onChange={(e) => setField("dias_ferias_anuais", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Saldo férias anterior">
              <Input
                type="number"
                min={0}
                className="input-yellow tabular-nums"
                value={draft.saldo_ferias_anterior ?? 0}
                onChange={(e) => setField("saldo_ferias_anterior", Number(e.target.value) || 0)}
              />
            </Field>
            {draft.departamento === "Projecto" && (
              <Field label="Margem lucro override (%)">
                <Input
                  type="number"
                  step="0.5"
                  placeholder="usa global"
                  className="input-yellow tabular-nums"
                  value={
                    draft.margem_lucro_pct_override != null
                      ? (draft.margem_lucro_pct_override * 100).toString()
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setField(
                      "margem_lucro_pct_override",
                      v === "" ? null : Number(v) / 100,
                    );
                  }}
                />
              </Field>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <Tabs value={tabValue} onValueChange={setActiveTab}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-auto flex-wrap">
              {snapshots.map((s) => (
                <TabsTrigger key={s.id} value={s.id} className="gap-2">
                  <span>{s.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {fmtDate(s.reference_date)}
                  </span>
                  {s.is_effective && (
                    <span className="rounded-full bg-positive/15 px-1.5 py-0.5 text-[10px] font-semibold text-positive">
                      EFE
                    </span>
                  )}
                </TabsTrigger>
              ))}
              <TabsTrigger value="resumo" className="gap-1">
                <BarChart3 className="h-3 w-3" /> Resumo
              </TabsTrigger>
            </TabsList>

            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4" /> Nova ficha
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova ficha salarial</DialogTitle>
                  <DialogDescription>
                    Cada ficha representa um snapshot a uma data específica.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Etiqueta">
                    <Input
                      className="input-yellow"
                      value={newForm.label}
                      onChange={(e) => setNewForm((f) => ({ ...f, label: e.target.value }))}
                    />
                  </Field>
                  <Field label="Data de referência">
                    <Input
                      type="date"
                      className="input-yellow"
                      value={newForm.reference_date}
                      onChange={(e) =>
                        setNewForm((f) => ({ ...f, reference_date: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Copiar valores de">
                    <Select
                      value={newForm.copyFrom || "none"}
                      onValueChange={(v) =>
                        setNewForm((f) => ({ ...f, copyFrom: v === "none" ? "" : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Em branco" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Em branco</SelectItem>
                        {snapshots.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label} · {fmtDate(s.reference_date)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Efectiva (em vigor)">
                    <div className="flex h-9 items-center">
                      <Switch
                        checked={newForm.is_effective}
                        onCheckedChange={(v) =>
                          setNewForm((f) => ({ ...f, is_effective: v }))
                        }
                      />
                    </div>
                  </Field>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setNewOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => createSnap.mutate()} disabled={createSnap.isPending}>
                    Criar ficha
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {snapshots.length === 0 && (
            <Card className="mt-4">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Ainda não existem fichas. Crie a primeira (ex: "Actual" com a data
                actual).
              </CardContent>
            </Card>
          )}

          {snapshots.map((s) => (
            <TabsContent key={s.id} value={s.id} className="mt-4">
              <SnapshotForm snapshot={s} />
            </TabsContent>
          ))}

          <TabsContent value="resumo" className="mt-4">
            <ResumoCompare snapshots={snapshots} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
