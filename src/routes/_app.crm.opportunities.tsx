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
import { Plus, Target, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import {
  formatEUR, OPPORTUNITY_STAGES, type CrmOpportunity, type OpportunityStage,
  contactFullName, type Contact,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/opportunities")({
  component: OpportunitiesPage,
});

type Row = CrmOpportunity & {
  company: { id: string; nome: string } | null;
  contact: Pick<Contact, "id" | "primeiro_nome" | "apelido" | "titulo"> | null;
};

function OpportunitiesPage() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"pipeline" | "list">("pipeline");

  const { data: opps = [], isLoading } = useQuery({
    queryKey: ["crm_opportunities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_opportunities")
        .select("*, company:companies(id, nome), contact:contacts(id, primeiro_nome, apelido, titulo)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const byStage = OPPORTUNITY_STAGES.map((s) => ({
    ...s,
    items: opps.filter((o) => o.stage === s.value),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {opps.length} opportunities · {formatEUR(opps.reduce((s, o) => s + Number(o.estimated_fee), 0))} estimated
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border">
            <Button
              variant={view === "pipeline" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("pipeline")}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4 mr-1" /> Pipeline
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4 mr-1" /> List
            </Button>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New opportunity
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : opps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
            <Target className="h-8 w-8 opacity-50" />
            No opportunities yet. Create the first one to start tracking potential work.
          </CardContent>
        </Card>
      ) : view === "pipeline" ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {byStage.map((col) => {
            const totalCol = col.items.reduce((s, p) => s + Number(p.estimated_fee), 0);
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
                  {col.items.map((o) => (
                    <Link
                      key={o.id}
                      to="/crm/opportunities/$opportunityId"
                      params={{ opportunityId: o.id }}
                      className="block rounded-md border bg-background p-2 text-sm hover:border-primary/40 hover:shadow-sm transition"
                    >
                      <div className="font-medium line-clamp-2">{o.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                        {o.company?.nome ?? "—"}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{o.probability}%</span>
                        <span className="font-semibold">{formatEUR(Number(o.estimated_fee))}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2 text-right">Est. fee</th>
                  <th className="px-3 py-2 text-right">Prob.</th>
                </tr>
              </thead>
              <tbody>
                {opps.map((o) => {
                  const stage = OPPORTUNITY_STAGES.find((s) => s.value === o.stage);
                  return (
                    <tr key={o.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link
                          to="/crm/opportunities/$opportunityId"
                          params={{ opportunityId: o.id }}
                          className="font-medium hover:underline"
                        >
                          {o.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{o.company?.nome ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className={`h-2 w-2 rounded-full ${stage?.color}`} />
                          {stage?.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatEUR(Number(o.estimated_fee))}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{o.probability}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <NewOpportunityDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewOpportunityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, nome").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
    enabled: open,
  });

  const [form, setForm] = useState({
    name: "",
    company_id: "",
    stage: "lead" as OpportunityStage,
    estimated_fee: "",
    probability: "50",
    expected_start_date: "",
    notas: "",
  });

  const reset = () =>
    setForm({
      name: "",
      company_id: "",
      stage: "lead",
      estimated_fee: "",
      probability: "50",
      expected_start_date: "",
      notas: "",
    });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      if (!form.company_id) throw new Error("Company is required");
      const { data, error } = await supabase.from("crm_opportunities").insert({
        name: form.name.trim(),
        company_id: form.company_id,
        stage: form.stage,
        estimated_fee: form.estimated_fee ? Number(form.estimated_fee) : 0,
        probability: Number(form.probability) || 0,
        expected_start_date: form.expected_start_date || null,
        notas: form.notas || null,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Opportunity created");
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New opportunity</DialogTitle>
          <DialogDescription>Track potential work before it becomes a quote.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name *</Label>
            <Input
              placeholder="e.g. Renovation — Av. X"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Company *</Label>
            <Select
              value={form.company_id}
              onValueChange={(v) => setForm((f) => ({ ...f, company_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estimated fee (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.estimated_fee}
              onChange={(e) => setForm((f) => ({ ...f, estimated_fee: e.target.value }))}
            />
          </div>
          <div>
            <Label>Probability (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))}
            />
          </div>
          <div>
            <Label>Stage</Label>
            <Select
              value={form.stage}
              onValueChange={(v) => setForm((f) => ({ ...f, stage: v as OpportunityStage }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPPORTUNITY_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Expected start date</Label>
            <Input
              type="date"
              value={form.expected_start_date}
              onChange={(e) => setForm((f) => ({ ...f, expected_start_date: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.name.trim() || !form.company_id}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Placeholder export to satisfy unused import linter when contactFullName not used inline
export { contactFullName };
