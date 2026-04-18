import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import {
  calcIrs,
  loadBrackets,
  pickTabela,
  ESTADOS_CIVIS,
  LOCALIZACOES,
} from "@/lib/irs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Save, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type Props = { snapshot: Snapshot };

const numericKeys = [
  "valor_base",
  "ss_atelier_pct",
  "ss_colaborador_pct",
  "irs_pct",
  "meses_pagos",
  "subsidio_alimentacao_diario",
  "dias_uteis",
  "ajudas_custo_anual",
  "beneficio_carro",
  "beneficio_ticket",
  "premio_associado",
  "outros_beneficios",
  "numero_titulares",
  "numero_dependentes",
  "dependentes_com_deficiencia",
  "ano_fiscal",
] as const;

export function SnapshotForm({ snapshot }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Snapshot>(snapshot);

  useEffect(() => setDraft(snapshot), [snapshot]);

  // Carrega escalões IRS para o ano/local/tabela do draft
  const tabela = pickTabela(draft.estado_civil, draft.numero_titulares);
  const { data: brackets = [] } = useQuery({
    queryKey: ["irs", draft.ano_fiscal, draft.localizacao, tabela],
    queryFn: () => loadBrackets(draft.ano_fiscal, draft.localizacao, tabela),
  });

  // Cálculo IRS automático sobre o valor base mensal
  const irsAuto = useMemo(
    () => calcIrs(draft.valor_base || 0, brackets, draft.numero_dependentes),
    [draft.valor_base, draft.numero_dependentes, brackets],
  );

  // Aplica IRS automático ao draft (taxa efectiva) se modo auto activo
  const draftEffective = useMemo<Snapshot>(() => {
    if (draft.irs_calculado_auto) {
      return { ...draft, irs_pct: irsAuto.irs_pct_efectiva };
    }
    return draft;
  }, [draft, irsAuto.irs_pct_efectiva]);

  const c = computeSnapshot(draftEffective);

  const save = useMutation({
    mutationFn: async () => {
      const patch: Partial<Snapshot> = {
        label: draft.label,
        reference_date: draft.reference_date,
        is_effective: draft.is_effective,
        notas: draft.notas,
        localizacao: draft.localizacao,
        estado_civil: draft.estado_civil,
        irs_calculado_auto: draft.irs_calculado_auto,
        // Persistir taxa efectiva calculada quando em modo auto
        irs_pct: draft.irs_calculado_auto ? irsAuto.irs_pct_efectiva : Number(draft.irs_pct) || 0,
      };
      for (const k of numericKeys) {
        if (k === "irs_pct") continue;
        (patch as Record<string, number>)[k] = Number(draft[k]) || 0;
      }
      const { error } = await supabase
        .from("salary_snapshots")
        .update(patch)
        .eq("id", snapshot.id);
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
      const { error } = await supabase
        .from("salary_snapshots")
        .delete()
        .eq("id", snapshot.id);
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
    <div className="space-y-4">
      {/* Cabeçalho da ficha */}
      <Card>
        <CardHeader className="flex-row items-end justify-between gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 flex-1">
            <Field label="Etiqueta">
              <Input
                className="input-yellow"
                value={draft.label}
                onChange={(e) => set("label", e.target.value)}
              />
            </Field>
            <Field label="Data de referência">
              <Input
                type="date"
                className="input-yellow"
                value={draft.reference_date}
                onChange={(e) => set("reference_date", e.target.value)}
              />
            </Field>
            <Field label="Efectiva (em vigor)">
              <div className="flex h-9 items-center gap-2">
                <Switch
                  checked={draft.is_effective}
                  onCheckedChange={(v) => set("is_effective", v)}
                />
                <span className="text-xs text-muted-foreground">
                  {draft.is_effective ? "Em vigor" : "Proposta / histórico"}
                </span>
              </div>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4" /> Guardar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar esta ficha?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acção é irreversível.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1 — Base contractual */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Base contractual</CardTitle>
            <CardDescription>Campos a amarelo são editáveis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Valor base mensal">
              <NumIn value={draft.valor_base} onChange={(n) => set("valor_base", n)} />
            </Row>
            <Row label="Meses pagos">
              <NumIn value={draft.meses_pagos} onChange={(n) => set("meses_pagos", n)} step={1} />
            </Row>
            <Row label="SS atelier (%)">
              <NumIn
                value={draft.ss_atelier_pct * 100}
                onChange={(n) => set("ss_atelier_pct", n / 100)}
                step={0.01}
                suffix="%"
              />
            </Row>
            <Row label="SS colaborador (%)">
              <NumIn
                value={draft.ss_colaborador_pct * 100}
                onChange={(n) => set("ss_colaborador_pct", n / 100)}
                step={0.01}
                suffix="%"
              />
            </Row>
            <Row label="IRS (%)">
              <NumIn
                value={draft.irs_pct * 100}
                onChange={(n) => set("irs_pct", n / 100)}
                step={0.1}
                suffix="%"
              />
            </Row>
            <Calc label="Bruto anual base" value={fmtEUR(c.baseAnual)} />
            <Calc label="SS atelier anual" value={fmtEUR(c.ssAtelierAnual)} />
            <Calc label="Líquido mensal (14 m)" value={fmtEUR(c.liquido14m)} />
            <Calc label="Líquido anual" value={fmtEUR(c.liquidoAnual)} />
          </CardContent>
        </Card>

        {/* 2 — Subsídio alimentação */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Subsídio de alimentação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Valor diário">
              <NumIn
                value={draft.subsidio_alimentacao_diario}
                onChange={(n) => set("subsidio_alimentacao_diario", n)}
                step={0.01}
              />
            </Row>
            <Row label="Dias úteis (ano)">
              <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-right text-sm tabular-nums text-muted-foreground">
                {draft.dias_uteis}
              </div>
            </Row>
            <p className="text-[11px] text-muted-foreground">
              Valor calculado em <strong>Definições → Dias úteis</strong> e propagado a todas as
              fichas. Para o alterar, edita a tabela de feriados/dias úteis e clica em "Aplicar a
              todas as fichas".
            </p>
            <Calc label="Total anual" value={fmtEUR(c.alimentacaoAnual)} />
            <Calc label="Média mensal" value={fmtEUR(c.alimentacaoMensal)} />
          </CardContent>
        </Card>

        {/* 3 — Ajudas de custo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Ajudas de custo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Valor anual">
              <NumIn
                value={draft.ajudas_custo_anual}
                onChange={(n) => set("ajudas_custo_anual", n)}
              />
            </Row>
            <Calc label="Média mensal" value={fmtEUR(c.ajudasMensal)} />
          </CardContent>
        </Card>

        {/* 4 — Benefícios */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Benefícios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Apoio carro">
              <NumIn
                value={draft.beneficio_carro}
                onChange={(n) => set("beneficio_carro", n)}
              />
            </Row>
            <Row label="Ticket">
              <NumIn
                value={draft.beneficio_ticket}
                onChange={(n) => set("beneficio_ticket", n)}
              />
            </Row>
            <Row label="Prémio de associado">
              <NumIn
                value={draft.premio_associado}
                onChange={(n) => set("premio_associado", n)}
              />
            </Row>
            <Row label="Outros">
              <NumIn
                value={draft.outros_beneficios}
                onChange={(n) => set("outros_beneficios", n)}
              />
            </Row>
            <Calc label="Total anual" value={fmtEUR(c.beneficiosAnual)} />
            <Calc label="Média mensal" value={fmtEUR(c.beneficiosMensal)} />
          </CardContent>
        </Card>
      </div>

      {/* Resumo da ficha */}
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="text-base">Resumo da ficha</CardTitle>
          <CardDescription>Valores calculados a partir dos campos amarelos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Bruto mensal" value={fmtEUR(c.brutoMensal)} />
            <Stat label="Bruto anual" value={fmtEUR(c.brutoAnual)} highlight />
            <Stat label="Líquido total mensal" value={fmtEUR(c.liquidoTotalMensal)} />
            <Stat label="Custo VBG anual" value={fmtEUR(c.custoVBG)} highlight />
          </div>
        </CardContent>
      </Card>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Calc({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3 border-t pt-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm tabular-nums">{value}</span>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={"rounded-md border p-3 " + (highlight ? "bg-primary/5 border-primary/40" : "")}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function NumIn({
  value,
  onChange,
  step = 0.01,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        step={step}
        className="input-yellow text-right tabular-nums pr-7"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
