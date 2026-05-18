import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, Trash2, Save, Users, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import {
  contactFullName, formatEUR, PIPELINE_STATUSES,
  type Company, type Contact, type FeeProposal,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/companies/$companyId")({
  component: CompanyDetail,
});

function CompanyDetail() {
  const { companyId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: company, isLoading } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
      if (error) throw error;
      return data as Company;
    },
  });

  useRecordRecentlyViewed({
    module: "crm",
    href: `/crm/companies/${companyId}`,
    label: company?.nome ?? "",
  });



  const { data: contacts = [] } = useQuery({
    queryKey: ["company-contacts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts").select("*").eq("company_id", companyId).order("primeiro_nome");
      if (error) throw error;
      return data as Contact[];
    },
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ["company-proposals", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals").select("*").eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FeeProposal[];
    },
  });

  const [form, setForm] = useState<Partial<Company> | null>(null);
  const current = form ?? company ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const { error } = await supabase.from("companies").update({
        nome: current.nome,
        website: current.website,
        email: current.email,
        telefone: current.telefone,
        morada: current.morada,
        industria: current.industria,
        status: current.status,
        notas: current.notas,
        nif: (current as Company & { nif?: string | null }).nif ?? null,
        company_type: (current as Company & { company_type?: string | null }).company_type ?? null,
      }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa actualizada");
      qc.invalidateQueries({ queryKey: ["company", companyId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      setForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("companies").delete().eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa eliminada");
      qc.invalidateQueries({ queryKey: ["companies"] });
      navigate({ to: "/crm/companies" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !current) {
    return <div className="text-sm text-muted-foreground">A carregar…</div>;
  }

  const update = <K extends keyof Company>(k: K, v: Company[K]) =>
    setForm((f) => ({ ...(f ?? company!), [k]: v }));

  return (
    <div className="space-y-4">
      <Link to="/crm/companies" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Empresas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {current.nome}
          </h2>
          <Badge variant="secondary" className="mt-1 capitalize">{current.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="text-destructive hover:text-destructive"
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
          <TabsTrigger value="contactos">Contactos ({contacts.length})</TabsTrigger>
          <TabsTrigger value="propostas">Propostas ({proposals.length})</TabsTrigger>
          <TabsTrigger value="actividades">Actividades</TabsTrigger>
        </TabsList>

        <TabsContent value="detalhes" className="space-y-4">
          {contacts[0] && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Contacto principal</CardTitle>
                <Link
                  to="/crm/companies/$companyId"
                  params={{ companyId }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Ver todos ({contacts.length})
                </Link>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <div className="font-medium">{contactFullName(contacts[0])}</div>
                  <div className="text-xs text-muted-foreground">{contacts[0].posicao ?? "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {contacts[0].email && <div>{contacts[0].email}</div>}
                  {(contacts[0].telemovel || contacts[0].telefone) && (
                    <div>{contacts[0].telemovel ?? contacts[0].telefone}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Detalhes da empresa</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input value={current.nome ?? ""} onChange={(e) => update("nome", e.target.value)} />
              </div>
              <div>
                <Label>Estado</Label>
                <Select
                  value={current.status ?? "activo"}
                  onValueChange={(v) => update("status", v as Company["status"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="prospecto">Prospecto</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>NIF / Tax ID</Label>
                <Input
                  value={(current as Company & { nif?: string | null }).nif ?? ""}
                  onChange={(e) => update("nif" as keyof Company, e.target.value as never)}
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select
                  value={(current as Company & { company_type?: string | null }).company_type ?? "__none__"}
                  onValueChange={(v) =>
                    update("company_type" as keyof Company, (v === "__none__" ? null : v) as never)
                  }
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                    <SelectItem value="fornecedor">Fornecedor</SelectItem>
                    <SelectItem value="parceiro">Parceiro</SelectItem>
                    <SelectItem value="prospecto">Prospecto</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Indústria</Label>
                <Input value={current.industria ?? ""} onChange={(e) => update("industria", e.target.value)} />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={current.website ?? ""} onChange={(e) => update("website", e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={current.email ?? ""} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={current.telefone ?? ""} onChange={(e) => update("telefone", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Morada</Label>
                <Input value={current.morada ?? ""} onChange={(e) => update("morada", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Notas</Label>
                <Textarea rows={3} value={current.notas ?? ""} onChange={(e) => update("notas", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contactos">
          <Card>
            <CardContent className="p-0">
              {contacts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Users className="h-6 w-6 opacity-50" />
                  Nenhum contacto associado.
                </div>
              ) : (
                <ul className="divide-y">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between p-3">
                      <div>
                        <div className="font-medium">{contactFullName(c)}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.posicao ?? "—"} {c.email && `· ${c.email}`}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{c.telemovel ?? c.telefone ?? ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="propostas">
          <Card>
            <CardContent className="p-0">
              {proposals.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
                  <GitBranch className="h-6 w-6 opacity-50" />
                  Nenhuma proposta.
                </div>
              ) : (
                <ul className="divide-y">
                  {proposals.map((p) => {
                    const meta = PIPELINE_STATUSES.find((s) => s.value === p.pipeline_status);
                    return (
                      <li key={p.id} className="p-3 hover:bg-muted/30">
                        <Link
                          to="/crm/pipeline/$proposalId"
                          params={{ proposalId: p.id }}
                          className="flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-medium">{p.titulo}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${meta?.color ?? "bg-muted"}`} />
                              {meta?.label} · {p.probabilidade}%
                            </div>
                          </div>
                          <div className="text-sm font-semibold">{formatEUR(Number(p.valor))}</div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actividades">
          <Card>
            <CardContent className="p-4">
              <ActivityTimeline companyId={companyId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
