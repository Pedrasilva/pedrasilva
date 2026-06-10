import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, GitBranch } from "lucide-react";
import { CompanyPicker } from "@/components/crm/company-picker";
import { toast } from "sonner";
import {
  formatEUR, PIPELINE_STATUSES, type Company, type Contact, type FeeProposal, type ProposalStatus,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/pipeline")({
  component: PipelineBoard,
});

type Row = FeeProposal & {
  company: Pick<Company, "id" | "nome"> | null;
  contact: Pick<Contact, "id" | "primeiro_nome" | "apelido" | "titulo"> | null;
};

function PipelineBoard() {
  const [open, setOpen] = useState(false);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ["fee_proposals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("*, company:companies(id, nome), contact:contacts!fee_proposals_contact_id_fkey(id, primeiro_nome, apelido, titulo)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const byStatus = PIPELINE_STATUSES.map((s) => ({
    ...s,
    items: proposals.filter((p) => p.pipeline_status === s.value),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {proposals.length} propostas no total
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova proposta
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : proposals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
            <GitBranch className="h-8 w-8 opacity-50" />
            Ainda sem propostas. Crie a primeira.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {byStatus.map((col) => {
            const totalCol = col.items.reduce((s, p) => s + Number(p.valor), 0);
            return (
              <div key={col.value} className="rounded-md border bg-muted/20 p-2 min-h-[200px]">
                <div className="flex items-center justify-between px-1 pb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2 w-2 rounded-full ${col.color}`} />
                    {col.label}
                    <span className="text-xs text-muted-foreground">· {col.items.length}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground px-1 pb-2">{formatEUR(totalCol)}</div>
                <div className="space-y-2">
                  {col.items.map((p) => (
                    <Link
                      key={p.id}
                      to="/crm/pipeline/$proposalId"
                      params={{ proposalId: p.id }}
                      className="block rounded-md border bg-background p-2 text-sm hover:border-primary/40 hover:shadow-sm transition"
                    >
                      <div className="font-medium line-clamp-2">{p.titulo}</div>
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                        {p.company?.nome ?? "Sem empresa"}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{p.probabilidade}%</span>
                        <span className="font-semibold">{formatEUR(Number(p.valor))}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewProposalDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewProposalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    titulo: "",
    company_id: "",
    valor: "",
    probabilidade: "50",
    pipeline_status: "lead" as ProposalStatus,
    data_proposta: new Date().toISOString().slice(0, 10),
    notas: "",
  });

  const reset = () =>
    setForm({
      titulo: "",
      company_id: "",
      valor: "",
      probabilidade: "50",
      pipeline_status: "lead",
      data_proposta: new Date().toISOString().slice(0, 10),
      notas: "",
    });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error("Título obrigatório");
      const { error } = await supabase.from("fee_proposals").insert({
        titulo: form.titulo.trim(),
        company_id: form.company_id || null,
        valor: form.valor ? Number(form.valor) : 0,
        probabilidade: Number(form.probabilidade) || 0,
        pipeline_status: form.pipeline_status,
        data_proposta: form.data_proposta || null,
        notas: form.notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposta criada");
      qc.invalidateQueries({ queryKey: ["fee_proposals"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova proposta</DialogTitle>
          <DialogDescription>Registe uma proposta de honorários.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Título *</Label>
            <Input
              placeholder="Ex: Reabilitação edifício Av. X"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Empresa</Label>
            <CompanyPicker
              value={form.company_id || null}
              onChange={(id) => setForm((f) => ({ ...f, company_id: id }))}
              placeholder="Sem empresa"
            />
          </div>
          <div>
            <Label>Valor (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
            />
          </div>
          <div>
            <Label>Probabilidade (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probabilidade}
              onChange={(e) => setForm((f) => ({ ...f, probabilidade: e.target.value }))}
            />
          </div>
          <div>
            <Label>Estado</Label>
            <Select
              value={form.pipeline_status}
              onValueChange={(v) => setForm((f) => ({ ...f, pipeline_status: v as ProposalStatus }))}
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
              value={form.data_proposta}
              onChange={(e) => setForm((f) => ({ ...f, data_proposta: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.titulo.trim()}>
            Criar proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
