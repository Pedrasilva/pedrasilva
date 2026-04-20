import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, GitBranch, Save, Trash2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import {
  formatEUR, PIPELINE_STATUSES,
  type Company, type Contact, type FeeProposal, type ProposalStatus,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/pipeline/$proposalId")({
  component: ProposalDetail,
});

function ProposalDetail() {
  const { proposalId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: proposal, isLoading } = useQuery({
    queryKey: ["fee_proposal", proposalId],
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_proposals").select("*").eq("id", proposalId).single();
      if (error) throw error;
      return data as FeeProposal;
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as Pick<Company, "id" | "nome">[];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-lite-for-proposal", proposal?.company_id],
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, primeiro_nome, apelido, titulo, company_id");
      if (proposal?.company_id) q = q.eq("company_id", proposal.company_id);
      const { data, error } = await q.order("primeiro_nome");
      if (error) throw error;
      return (data ?? []) as Pick<Contact, "id" | "primeiro_nome" | "apelido" | "titulo" | "company_id">[];
    },
    enabled: !!proposal,
  });

  const [form, setForm] = useState<Partial<FeeProposal> | null>(null);
  const current = form ?? proposal ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const { error } = await supabase.from("fee_proposals").update({
        titulo: current.titulo,
        company_id: current.company_id,
        contact_id: current.contact_id,
        valor: Number(current.valor ?? 0),
        probabilidade: Number(current.probabilidade ?? 0),
        pipeline_status: current.pipeline_status,
        data_proposta: current.data_proposta,
        data_decisao: current.data_decisao,
        notas: current.notas,
      }).eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposta actualizada");
      qc.invalidateQueries({ queryKey: ["fee_proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals"] });
      setForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_proposals").delete().eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposta eliminada");
      qc.invalidateQueries({ queryKey: ["fee_proposals"] });
      navigate({ to: "/crm/pipeline" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertToProject = useMutation({
    mutationFn: async () => {
      if (!current) return;
      let clientName = "Cliente";
      if (current.company_id) {
        const { data } = await supabase.from("companies").select("nome").eq("id", current.company_id).single();
        if (data?.nome) clientName = data.nome;
      }
      const { data: created, error } = await supabase.from("pm_projects").insert({
        name: current.titulo ?? "Novo projecto",
        client: clientName,
        status: "active",
        notes: current.notas ?? null,
      }).select("id").single();
      if (error) throw error;
      if (!created?.id) throw new Error("Falha ao criar projecto");

      const { error: linkError } = await supabase.from("fee_proposals").update({
        pm_project_id: created.id,
        pipeline_status: "ganho",
        data_decisao: new Date().toISOString().slice(0, 10),
      }).eq("id", proposalId);
      if (linkError) throw linkError;

      return created.id as string;
    },
    onSuccess: (projectId) => {
      toast.success("Proposta convertida em projecto");
      qc.invalidateQueries({ queryKey: ["fee_proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals"] });
      navigate({ to: "/projects/$projectId", params: { projectId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !current) {
    return <div className="text-sm text-muted-foreground">A carregar…</div>;
  }

  const update = <K extends keyof FeeProposal>(k: K, v: FeeProposal[K]) =>
    setForm((f) => ({ ...(f ?? proposal!), [k]: v }));

  const meta = PIPELINE_STATUSES.find((s) => s.value === current.pipeline_status);
  const alreadyConverted = !!current.pm_project_id;

  return (
    <div className="space-y-4">
      <Link to="/crm/pipeline" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Pipeline
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            {current.titulo}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <span className={`h-2 w-2 rounded-full ${meta?.color ?? "bg-muted"}`} />
              {meta?.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatEUR(Number(current.valor ?? 0))} · {current.probabilidade}%
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {alreadyConverted ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/projects/$projectId" params={{ projectId: current.pm_project_id! }}>
                <Rocket className="h-4 w-4 mr-1" /> Ver projecto
              </Link>
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-50">
                  <Rocket className="h-4 w-4 mr-1" /> Converter em projecto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Converter proposta em projecto?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cria um novo projecto no módulo Projects com o nome e cliente desta proposta,
                    e marca a proposta como <strong>Ganho</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => convertToProject.mutate()}>Converter</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Eliminar
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!form || save.isPending}>
            <Save className="h-4 w-4 mr-1" /> Guardar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="detalhes">
        <TabsList>
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          <TabsTrigger value="actividades">Actividades</TabsTrigger>
        </TabsList>

        <TabsContent value="detalhes">
          <Card>
            <CardHeader><CardTitle className="text-base">Proposta</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Título</Label>
                <Input value={current.titulo ?? ""} onChange={(e) => update("titulo", e.target.value)} />
              </div>
              <div>
                <Label>Empresa</Label>
                <Select
                  value={current.company_id ?? "none"}
                  onValueChange={(v) => update("company_id", v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Sem empresa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem empresa</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Contacto</Label>
                <Select
                  value={current.contact_id ?? "none"}
                  onValueChange={(v) => update("contact_id", v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Sem contacto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem contacto</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {[c.titulo, c.primeiro_nome, c.apelido].filter(Boolean).join(" ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(current.valor ?? 0)}
                  onChange={(e) => update("valor", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Probabilidade (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={String(current.probabilidade ?? 0)}
                  onChange={(e) => update("probabilidade", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Select
                  value={current.pipeline_status ?? "lead"}
                  onValueChange={(v) => update("pipeline_status", v as ProposalStatus)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data da proposta</Label>
                <Input
                  type="date"
                  value={current.data_proposta ?? ""}
                  onChange={(e) => update("data_proposta", e.target.value || null)}
                />
              </div>
              <div>
                <Label>Data da decisão</Label>
                <Input
                  type="date"
                  value={current.data_decisao ?? ""}
                  onChange={(e) => update("data_decisao", e.target.value || null)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Notas</Label>
                <Textarea
                  rows={3}
                  value={current.notas ?? ""}
                  onChange={(e) => update("notas", e.target.value || null)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actividades">
          <Card>
            <CardContent className="p-4">
              <ActivityTimeline proposalId={proposalId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
