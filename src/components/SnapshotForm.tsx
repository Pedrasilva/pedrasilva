import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
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
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HighlightCard } from "./snapshot/HighlightCard";
import { FamilySection } from "./snapshot/FamilySection";
import { SimulationTab } from "./snapshot/SimulationTab";
import { LiquidoTab } from "./snapshot/LiquidoTab";
import { BrutoTab } from "./snapshot/BrutoTab";
import { FieldStacked } from "./snapshot/inputs";

type Props = { snapshot: Snapshot };

const numericKeys = [
  "valor_base", "ss_atelier_pct", "ss_colaborador_pct", "meses_pagos",
  "subsidio_alimentacao_diario", "dias_uteis", "ajudas_custo_anual",
  "beneficio_carro", "beneficio_ticket", "premio_associado", "outros_beneficios",
  "numero_titulares", "numero_dependentes", "dependentes_com_deficiencia", "ano_fiscal",
] as const;

export function SnapshotForm({ snapshot }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Snapshot>(snapshot);

  useEffect(() => setDraft(snapshot), [snapshot]);

  const tabela = pickTabela(draft.estado_civil, draft.numero_titulares);
  const { data: brackets = [] } = useQuery({
    queryKey: ["irs", draft.ano_fiscal, draft.localizacao, tabela],
    queryFn: () => loadBrackets(draft.ano_fiscal, draft.localizacao, tabela),
  });

  const irsAuto = useMemo(
    () => calcIrs(draft.valor_base || 0, brackets, draft.numero_dependentes),
    [draft.valor_base, draft.numero_dependentes, brackets],
  );

  const draftEffective = useMemo<Snapshot>(
    () => (draft.irs_calculado_auto ? { ...draft, irs_pct: irsAuto.irs_pct_efectiva } : draft),
    [draft, irsAuto.irs_pct_efectiva],
  );

  const c = computeSnapshot(draftEffective);

  const save = useMutation({
    mutationFn: async () => {
      const patch = {
        label: draft.label,
        reference_date: draft.reference_date,
        is_effective: draft.is_effective,
        notas: draft.notas,
        localizacao: draft.localizacao,
        estado_civil: draft.estado_civil,
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
        numero_titulares: Number(draft.numero_titulares) || 1,
        numero_dependentes: Number(draft.numero_dependentes) || 0,
        dependentes_com_deficiencia: Number(draft.dependentes_com_deficiencia) || 0,
        ano_fiscal: Number(draft.ano_fiscal) || 2026,
      };
      const { error } = await supabase.from("salary_snapshots").update(patch).eq("id", snapshot.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ficha guardada");
      qc.invalidateQueries({ queryKey: ["snapshots", snapshot.collaborator_id] });
      qc.invalidateQueries({ queryKey: ["all-snapshots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

      {/* Agregado familiar */}
      <Card>
        <CardContent className="pt-6">
          <FamilySection draft={draft} set={set} irsAuto={irsAuto} />
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
