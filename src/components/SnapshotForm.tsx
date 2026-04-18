import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, fmtEUR, type Collaborator, type Snapshot } from "@/lib/salary";
import { calcIrs, loadBrackets, pickTabela } from "@/lib/irs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Save, Trash2, Sparkles, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { HighlightCard } from "./snapshot/HighlightCard";
import { SimulationTab } from "./snapshot/SimulationTab";
import { LiquidoTab } from "./snapshot/LiquidoTab";
import { BrutoTab } from "./snapshot/BrutoTab";
import { FieldStacked } from "./snapshot/inputs";

type Props = { snapshot: Snapshot; collaborator: Collaborator };

const TABELA_LABEL: Record<string, string> = {
  nao_casado: "Não casado",
  casado_unico_titular: "Casado · único titular",
  casado_dois_titulares: "Casado · dois titulares",
};

const TRACKED_FIELDS: (keyof Snapshot)[] = [
  "label", "reference_date", "is_effective", "notas",
  "irs_calculado_auto", "irs_pct", "valor_base",
  "ss_atelier_pct", "ss_colaborador_pct", "meses_pagos",
  "subsidio_alimentacao_diario", "dias_uteis", "ajudas_custo_anual",
  "beneficio_carro", "beneficio_ticket", "premio_associado", "outros_beneficios",
];

export function SnapshotForm({ snapshot, collaborator }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Snapshot>(snapshot);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => setDraft(snapshot), [snapshot]);

  const isDirty = useMemo(
    () => TRACKED_FIELDS.some((k) => (draft[k] ?? null) !== (snapshot[k] ?? null)),
    [draft, snapshot],
  );

  // Contexto fiscal vem do colaborador
  const tabela = pickTabela(collaborator.estado_civil, collaborator.numero_titulares);
  const { data: brackets = [] } = useQuery({
    queryKey: ["irs", collaborator.ano_fiscal, collaborator.localizacao, tabela],
    queryFn: () => loadBrackets(collaborator.ano_fiscal, collaborator.localizacao, tabela),
  });

  const irsAuto = useMemo(
    () => calcIrs(draft.valor_base || 0, brackets, collaborator.numero_dependentes),
    [draft.valor_base, collaborator.numero_dependentes, brackets],
  );

  // Snapshot efectivo herda os valores do colaborador para cálculo
  const draftEffective = useMemo<Snapshot>(
    () => ({
      ...draft,
      localizacao: collaborator.localizacao,
      estado_civil: collaborator.estado_civil,
      numero_titulares: collaborator.numero_titulares,
      numero_dependentes: collaborator.numero_dependentes,
      dependentes_com_deficiencia: collaborator.dependentes_com_deficiencia,
      ano_fiscal: collaborator.ano_fiscal,
      irs_pct: draft.irs_calculado_auto ? irsAuto.irs_pct_efectiva : draft.irs_pct,
    }),
    [draft, collaborator, irsAuto.irs_pct_efectiva],
  );

  const c = computeSnapshot(draftEffective);

  const save = useMutation({
    mutationFn: async () => {
      const patch = {
        label: draft.label,
        reference_date: draft.reference_date,
        is_effective: draft.is_effective,
        notas: draft.notas,
        irs_calculado_auto: draft.irs_calculado_auto,
        irs_pct: draft.irs_calculado_auto ? irsAuto.irs_pct_efectiva : Number(draft.irs_pct) || 0,
        valor_base: Number(draft.valor_base) || 0,
        ss_atelier_pct: Number(draft.ss_atelier_pct) || 0,
        ss_colaborador_pct: Number(draft.ss_colaborador_pct) || 0,
        meses_pagos: Number(draft.meses_pagos) || 14,
        subsidio_alimentacao_diario: Number(draft.subsidio_alimentacao_diario) || 0,
        dias_uteis: Number(draft.dias_uteis) || 0,
        ajudas_custo_anual: Number(draft.ajudas_custo_anual) || 0,
        beneficio_carro: Number(draft.beneficio_carro) || 0,
        beneficio_ticket: Number(draft.beneficio_ticket) || 0,
        premio_associado: Number(draft.premio_associado) || 0,
        outros_beneficios: Number(draft.outros_beneficios) || 0,
        // Espelha o agregado familiar do colaborador para manter o histórico consistente
        localizacao: collaborator.localizacao,
        estado_civil: collaborator.estado_civil,
        numero_titulares: collaborator.numero_titulares,
        numero_dependentes: collaborator.numero_dependentes,
        dependentes_com_deficiencia: collaborator.dependentes_com_deficiencia,
        ano_fiscal: collaborator.ano_fiscal,
      };
      const { error } = await supabase.from("salary_snapshots").update(patch).eq("id", snapshot.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setLastSavedAt(new Date());
      qc.invalidateQueries({ queryKey: ["snapshots", snapshot.collaborator_id] });
      qc.invalidateQueries({ queryKey: ["all-snapshots"] });
    },
    onError: (e: Error) => toast.error(`Erro a guardar: ${e.message}`),
  });

  // Auto-save com debounce de 1s
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty || save.isPending) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save.mutate(), 1000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, isDirty]);

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("salary_snapshots").delete().eq("id", snapshot.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ficha eliminada");
      qc.invalidateQueries({ queryKey: ["snapshots", snapshot.collaborator_id] });
      qc.invalidateQueries({ queryKey: ["all-snapshots"] });
    },
  });

  const set = <K extends keyof Snapshot>(k: K, v: Snapshot[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <Card className="border-[var(--clay)]/30 bg-[color-mix(in_oklab,var(--cream)_30%,transparent)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 flex-1">
            <FieldStacked label="Etiqueta">
              <Input className="input-yellow" value={draft.label}
                onChange={(e) => set("label", e.target.value)} />
            </FieldStacked>
            <FieldStacked label="Data de referência">
              <Input type="date" className="input-yellow" value={draft.reference_date}
                onChange={(e) => set("reference_date", e.target.value)} />
            </FieldStacked>
            <FieldStacked label="Efectiva (em vigor)">
              <div className="flex h-9 items-center gap-2">
                <Switch checked={draft.is_effective}
                  onCheckedChange={(v) => set("is_effective", v)} />
                <span className="text-xs text-muted-foreground">
                  {draft.is_effective ? "Em vigor" : "Proposta / histórico"}
                </span>
              </div>
            </FieldStacked>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4" /> Guardar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar esta ficha?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acção é irreversível.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
      </Card>

      {/* Cards de destaque */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <HighlightCard label="Líquido total mensal" tone="sage"
          value={fmtEUR(c.liquidoTotalMensal)}
          hint="Inclui alimentação e ajudas" />
        <HighlightCard label="Custo empregador (VBG)" tone="clay"
          value={fmtEUR(c.custoVBG)}
          hint="Total anual com SS, benefícios e ajudas" />
        <HighlightCard label="Retenção IRS mensal"
          value={fmtEUR(c.irsMensal)}
          hint={
            draft.irs_calculado_auto
              ? `Auto · marginal ${(irsAuto.taxa_marginal * 100).toFixed(1)}% · efectiva ${(irsAuto.irs_pct_efectiva * 100).toFixed(2)}%`
              : `Manual · ${(draft.irs_pct * 100).toFixed(1)}%`
          } />
      </div>

      {/* Cálculo automático IRS — usa contexto do colaborador */}
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-lg border border-[var(--sage)]/30 bg-[color-mix(in_oklab,var(--sage)_6%,transparent)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--sage)]" />
                <div>
                  <div className="text-sm font-medium">Cálculo automático de IRS</div>
                  <div className="text-[11px] text-muted-foreground">
                    Tabela: {TABELA_LABEL[tabela]} · {collaborator.localizacao} · {collaborator.ano_fiscal}
                    {" · "}
                    <span className="italic">contexto do colaborador</span>
                  </div>
                </div>
              </div>
              <Switch checked={draft.irs_calculado_auto}
                onCheckedChange={(v) => set("irs_calculado_auto", v)} />
            </div>
            {draft.irs_calculado_auto && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                <Mini label="Taxa marginal" value={`${(irsAuto.taxa_marginal * 100).toFixed(1)}%`} />
                <Mini label="Parcela a abater" value={fmtEUR(irsAuto.parcela_abater)} />
                <Mini label="IRS mensal" value={fmtEUR(irsAuto.irs_mensal)} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="simulacao">
        <TabsList>
          <TabsTrigger value="simulacao">Simulação</TabsTrigger>
          <TabsTrigger value="liquido">Visão Líquido</TabsTrigger>
          <TabsTrigger value="bruto">Visão Bruto</TabsTrigger>
        </TabsList>
        <TabsContent value="simulacao">
          <SimulationTab draft={draftEffective} set={set} />
        </TabsContent>
        <TabsContent value="liquido">
          <LiquidoTab draft={draftEffective} />
        </TabsContent>
        <TabsContent value="bruto">
          <BrutoTab draft={draftEffective} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}
