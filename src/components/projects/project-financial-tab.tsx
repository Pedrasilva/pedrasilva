/**
 * Project Financial tab.
 *
 * Editable mirror of the quote-side "Financial" (payment schedule) view.
 * Reads/writes `pm_payment_schedule_items`, which is populated by the
 * quote→project conversion and may be freely edited by admins afterwards.
 *
 * Grouped per calendar month into a single invoice (one row per supplier
 * + Architecture line), matching the layout used on the CRM side.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Row = {
  id: string;
  project_id: string;
  stage_id: string | null;
  label: string;
  trigger_type: string;
  amount_type: string;
  amount_value: number;
  expected_invoice_date: string | null;
  expected_payment_date: string | null;
  sort_order: number;
  direction: "inflow" | "outflow";
  supplier_label: string | null;
  supplier_id: string | null;
  vat_rate: number;
  billing_status: "planned" | "issued" | "paid" | "cancelled" | "draft";
};

type Stage = { id: string; name: string };

const fmtEUR = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(v ?? 0));

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  planned: "outline",
  draft: "outline",
  issued: "secondary",
  paid: "default",
  cancelled: "destructive",
};

export function ProjectFinancialTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["pm-financial", projectId],
    queryFn: async () => {
      const [itemsQ, stagesQ] = await Promise.all([
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("pm_payment_schedule_items" as any)
          .select("*")
          .eq("project_id", projectId)
          .order("expected_invoice_date", { ascending: true, nullsFirst: false })
          .order("sort_order", { ascending: true }),
        supabase
          .from("pm_stages")
          .select("id, name")
          .eq("project_id", projectId)
          .order("sort_order", { ascending: true }),
      ]);
      if (itemsQ.error) throw itemsQ.error;
      if (stagesQ.error) throw stagesQ.error;
      return {
        items: (itemsQ.data ?? []) as Row[],
        stages: (stagesQ.data ?? []) as Stage[],
      };
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Row> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("pm_payment_schedule_items" as any)
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-financial", projectId] });
      setEditingId(null);
      setDraft({});
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("pm_payment_schedule_items" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-financial", projectId] });
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insert = useMutation({
    mutationFn: async () => {
      const maxSort = Math.max(0, ...(data?.items ?? []).map((r) => r.sort_order ?? 0));
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("pm_payment_schedule_items" as any)
        .insert({
          project_id: projectId,
          label: "New line",
          trigger_type: "manual_date",
          amount_type: "fixed",
          amount_value: 0,
          expected_invoice_date: new Date().toISOString().slice(0, 10),
          sort_order: maxSort + 1,
          direction: "inflow",
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-financial", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const stageName = useMemo(() => {
    const m = new Map<string, string>();
    (data?.stages ?? []).forEach((s) => m.set(s.id, s.name));
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "—");
  }, [data?.stages]);

  // Group by month for the invoice plan summary
  const grouped = useMemo(() => {
    const items = (data?.items ?? []).filter((r) => r.direction === "inflow");
    const map = new Map<string, Row[]>();
    items.forEach((r) => {
      const key = r.expected_invoice_date ? r.expected_invoice_date.slice(0, 7) : "—";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data?.items]);

  const grandTotal = (data?.items ?? [])
    .filter((r) => r.direction === "inflow")
    .reduce((s, r) => s + Number(r.amount_value ?? 0), 0);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const beginEdit = (r: Row) => {
    setEditingId(r.id);
    setDraft({ ...r });
  };

  const saveEdit = () => {
    if (!editingId) return;
    update.mutate({ id: editingId, ...draft });
  };

  return (
    <div className="space-y-6">
      {/* Invoice plan summary */}
      <Card className="border-2 border-foreground/80">
        <CardHeader className="pb-3">
          <div className="flex items-baseline justify-between gap-4">
            <CardTitle className="text-base uppercase tracking-wide">Financial</CardTitle>
            <div className="text-lg font-bold tabular-nums">{fmtEUR(grandTotal)}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            Plano de faturação ao cliente — herdado do orçamento aprovado e editável aqui.
          </div>
        </CardHeader>
        <CardContent>
          {grouped.length === 0 ? (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sem linhas. Carregue em &quot;Adicionar linha&quot; abaixo para começar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-28">Mês</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right w-32">Valor</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(([month, rows]) => {
                  const subtotal = rows.reduce((s, r) => s + Number(r.amount_value ?? 0), 0);
                  return (
                    <>
                      {rows.map((r, idx) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {idx === 0 ? month : ""}
                          </TableCell>
                          <TableCell>{r.label}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {stageName(r.stage_id)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtEUR(Number(r.amount_value ?? 0))}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANTS[r.billing_status] ?? "outline"}>
                              {r.billing_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={3} className="text-right text-xs font-medium">
                          Subtotal {month}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {fmtEUR(subtotal)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Editable line items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">Linhas (editar)</CardTitle>
          <Button size="sm" variant="outline" onClick={() => insert.mutate()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar linha
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Data fatura</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map((r) => {
                const editing = editingId === r.id;
                const d = editing ? draft : r;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {editing ? (
                        <Input
                          value={String(d.label ?? "")}
                          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        />
                      ) : (
                        r.label
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Select
                          value={d.stage_id ?? "none"}
                          onValueChange={(v) =>
                            setDraft({ ...draft, stage_id: v === "none" ? null : v })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {(data?.stages ?? []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {stageName(r.stage_id)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Input
                          type="date"
                          value={String(d.expected_invoice_date ?? "")}
                          onChange={(e) =>
                            setDraft({ ...draft, expected_invoice_date: e.target.value || null })
                          }
                        />
                      ) : (
                        r.expected_invoice_date ?? "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {editing ? (
                        <Input
                          type="number"
                          step="0.01"
                          className="text-right"
                          value={Number(d.amount_value ?? 0)}
                          onChange={(e) =>
                            setDraft({ ...draft, amount_value: Number(e.target.value) })
                          }
                        />
                      ) : (
                        fmtEUR(Number(r.amount_value ?? 0))
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Select
                          value={String(d.billing_status ?? "planned")}
                          onValueChange={(v) =>
                            setDraft({ ...draft, billing_status: v as Row["billing_status"] })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["planned", "draft", "issued", "paid", "cancelled"].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={STATUS_VARIANTS[r.billing_status] ?? "outline"}>
                          {r.billing_status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Select
                          value={String(d.direction ?? "inflow")}
                          onValueChange={(v) =>
                            setDraft({ ...draft, direction: v as Row["direction"] })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inflow">Inflow</SelectItem>
                            <SelectItem value="outflow">Outflow</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{r.direction}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editing ? (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={saveEdit}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setDraft({});
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => beginEdit(r)}>
                            Editar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove.mutate(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
