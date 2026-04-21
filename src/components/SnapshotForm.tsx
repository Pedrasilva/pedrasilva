import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, fmtEUR, type Collaborator, type Snapshot } from "@/lib/salary";
import { calcIrs, ESTADOS_CIVIS, loadBracketsWithMeta, LOCALIZACOES, pickTabela } from "@/lib/irs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Save, Trash2, Sparkles, Check, Loader2, Lock, Copy, ChevronDown, Layers } from "lucide-react";
import { toast } from "sonner";
import { ValueChainSummary } from "./snapshot/ValueChainSummary";
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
  "ss_atelier_pct", "ss_colaborador_pct", "meses_pagos", "subsidios_modo",
  "subsidio_alimentacao_diario", "dias_uteis", "ajudas_custo_anual",
  "subsidio_alimentacao_manual", "subsidio_alimentacao_diario_manual",
  "beneficio_carro", "beneficio_ticket", "premio_associado", "outros_beneficios", "beneficio_variavel",
  // Agregado familiar — trancado por ficha (snapshot histórico)
  "localizacao", "estado_civil", "numero_titulares", "numero_dependentes",
  "dependentes_com_deficiencia", "ano_fiscal",
];

export function SnapshotForm({ snapshot, collaborator }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Snapshot>(snapshot);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  useEffect(() => setDraft(snapshot), [snapshot]);

  const isDirty = useMemo(
    () => TRACKED_FIELDS.some((k) => (draft[k] ?? null) !== (snapshot[k] ?? null)),
    [draft, snapshot],
  );

  // Agregado familiar é trancado por ficha — usa o snapshot, NÃO o colaborador.
  // Isto permite que cada ficha mantenha o seu contexto fiscal histórico.
  const tabela = pickTabela(draft.estado_civil, draft.numero_titulares);
  const { data: irsTableData = { brackets: [], resolvedYear: draft.ano_fiscal, isFallback: false } } = useQuery({
    queryKey: ["irs", draft.ano_fiscal, draft.localizacao, tabela],
    queryFn: () => loadBracketsWithMeta(draft.ano_fiscal, draft.localizacao, tabela),
  });
  const brackets = irsTableData.brackets;

  // O subsídio de alimentação varia por ano civil — usamos o ano da data de referência da ficha
  const refYear = useMemo(() => {
    const y = Number((draft.reference_date ?? "").slice(0, 4));
    return Number.isFinite(y) && y > 1900 ? y : new Date().getFullYear();
  }, [draft.reference_date]);

  const { data: mealRates = [] } = useQuery({
    queryKey: ["meal-allowance-rates-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_allowance_rates")
        .select("ano, valor_cartao, valor_dinheiro")
        .order("ano", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { ano: number; valor_cartao: number; valor_dinheiro: number }[];
    },
  });

  const mealDaily = useMemo(() => {
    if (mealRates.length === 0) return 0;
    // Match exato do ano; senão usa o último ano <= refYear (ou o mais antigo se nenhum couber)
    const exact = mealRates.find((r) => r.ano === refYear);
    if (exact) return Number(exact.valor_cartao);
    const earlier = mealRates.filter((r) => r.ano <= refYear).sort((a, b) => b.ano - a.ano)[0];
    if (earlier) return Number(earlier.valor_cartao);
    return Number(mealRates[0].valor_cartao);
  }, [mealRates, refYear]);

  const irsAuto = useMemo(
    () => calcIrs(draft.valor_base || 0, brackets, draft.numero_dependentes),
    [draft.valor_base, draft.numero_dependentes, brackets],
  );

  const effectiveMealDaily = draft.subsidio_alimentacao_manual
    ? Number(draft.subsidio_alimentacao_diario_manual) || 0
    : mealDaily;

  const draftEffective = useMemo<Snapshot>(
    () => ({
      ...draft,
      irs_pct: draft.irs_calculado_auto ? irsAuto.irs_pct_efectiva : draft.irs_pct,
      subsidio_alimentacao_diario: effectiveMealDaily,
    }),
    [draft, irsAuto.irs_pct_efectiva, effectiveMealDaily],
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
        subsidios_modo: draft.subsidios_modo ?? "tradicional",
        subsidio_alimentacao_diario: effectiveMealDaily,
        subsidio_alimentacao_manual: draft.subsidio_alimentacao_manual,
        subsidio_alimentacao_diario_manual: Number(draft.subsidio_alimentacao_diario_manual) || 0,
        dias_uteis: Number(draft.dias_uteis) || 0,
        ajudas_custo_anual: Number(draft.ajudas_custo_anual) || 0,
        beneficio_carro: Number(draft.beneficio_carro) || 0,
        beneficio_ticket: Number(draft.beneficio_ticket) || 0,
        premio_associado: Number(draft.premio_associado) || 0,
        outros_beneficios: Number(draft.outros_beneficios) || 0,
        beneficio_variavel: Number(draft.beneficio_variavel) || 0,
        // Agregado familiar — gravado a partir do draft (trancado por ficha)
        localizacao: draft.localizacao,
        estado_civil: draft.estado_civil,
        numero_titulares: Number(draft.numero_titulares) || 1,
        numero_dependentes: Number(draft.numero_dependentes) || 0,
        dependentes_com_deficiencia: Number(draft.dependentes_com_deficiencia) || 0,
        ano_fiscal: Number(draft.ano_fiscal) || new Date().getFullYear(),
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
      <Card className="sticky top-2 z-20 border-[var(--clay)]/30 bg-[color-mix(in_oklab,var(--cream)_60%,var(--background))] shadow-sm backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--cream)_45%,var(--background))]">
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
          <div className="flex items-center gap-2">
              <SaveStatus isDirty={isDirty} isSaving={save.isPending} lastSavedAt={lastSavedAt} />
            <Button onClick={() => save.mutate()} disabled={save.isPending || !isDirty}>
              <Save className="h-4 w-4" /> Guardar ficha
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

      <Card>
        <Collapsible open={contextOpen} onOpenChange={setContextOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                aria-expanded={contextOpen}
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    contextOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
                <Layers className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Cadeia de valor, agregado familiar e IRS</div>
                  <div className="text-[11px] text-muted-foreground">
                    Resumo da distribuição do custo, contexto fiscal trancado nesta ficha e cálculo automático de IRS.
                  </div>
                </div>
              </button>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <ValueChainSummary c={c} />

              <div className="rounded-lg border bg-card">
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-[var(--clay)]" />
                      <div>
                        <div className="text-sm font-medium">Agregado familiar (trancado nesta ficha)</div>
                        <div className="text-[11px] text-muted-foreground">
                          Estes valores são guardados no histórico desta ficha e só mudam aqui.
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        set("localizacao", collaborator.localizacao);
                        set("estado_civil", collaborator.estado_civil);
                        set("numero_titulares", collaborator.numero_titulares);
                        set("numero_dependentes", collaborator.numero_dependentes);
                        set("dependentes_com_deficiencia", collaborator.dependentes_com_deficiencia);
                        set("ano_fiscal", collaborator.ano_fiscal);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar do colaborador
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <FieldStacked label="Localização">
                      <Select value={draft.localizacao} onValueChange={(v) => set("localizacao", v)}>
                        <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LOCALIZACOES.map((l) => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldStacked>
                    <FieldStacked label="Estado civil">
                      <Select value={draft.estado_civil} onValueChange={(v) => set("estado_civil", v)}>
                        <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ESTADOS_CIVIS.map((e) => (
                            <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldStacked>
                    <FieldStacked label="Nº titulares">
                      <Input
                        type="number" min={1} max={2}
                        className="input-yellow tabular-nums"
                        value={draft.numero_titulares}
                        onChange={(e) => set("numero_titulares", Number(e.target.value) || 1)}
                      />
                    </FieldStacked>
                    <FieldStacked label="Nº dependentes">
                      <Input
                        type="number" min={0}
                        className="input-yellow tabular-nums"
                        value={draft.numero_dependentes}
                        onChange={(e) => set("numero_dependentes", Number(e.target.value) || 0)}
                      />
                    </FieldStacked>
                    <FieldStacked label="Dep. c/ deficiência">
                      <Input
                        type="number" min={0}
                        className="input-yellow tabular-nums"
                        value={draft.dependentes_com_deficiencia}
                        onChange={(e) => set("dependentes_com_deficiencia", Number(e.target.value) || 0)}
                      />
                    </FieldStacked>
                    <FieldStacked label="Ano fiscal">
                      <Input
                        type="number" min={2000} max={2100}
                        className="input-yellow tabular-nums"
                        value={draft.ano_fiscal}
                        onChange={(e) => set("ano_fiscal", Number(e.target.value) || new Date().getFullYear())}
                      />
                    </FieldStacked>
                  </div>
                  <Label className="block text-[11px] text-muted-foreground">
                    Editar o agregado na página do colaborador <strong>não</strong> altera fichas existentes — só fichas novas.
                  </Label>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--sage)]/30 bg-[color-mix(in_oklab,var(--sage)_6%,transparent)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--sage)]" />
                    <div>
                      <div className="text-sm font-medium">Cálculo automático de IRS</div>
                      <div className="text-[11px] text-muted-foreground">
                        Tabela: {TABELA_LABEL[tabela]} · {draft.localizacao} · {irsTableData.resolvedYear ?? draft.ano_fiscal}
                        {irsTableData.isFallback ? " · fallback automático" : ""}
                        {" · "}
                        <span className="italic">contexto trancado na ficha</span>
                      </div>
                    </div>
                  </div>
                  <Switch checked={draft.irs_calculado_auto}
                    onCheckedChange={(v) => set("irs_calculado_auto", v)} />
                </div>
                {draft.irs_calculado_auto && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-4">
                      <Mini label="Taxa marginal" value={`${(irsAuto.taxa_marginal * 100).toFixed(1)}%`} />
                      <Mini label="Parcela a abater" value={fmtEUR(irsAuto.parcela_abater)} />
                      <Mini label="IRS mensal" value={fmtEUR(irsAuto.irs_mensal)} />
                      <Mini label="% IRS efectiva" value={`${(irsAuto.irs_pct_efectiva * 100).toFixed(2)}%`} />
                    </div>
                    {irsTableData.isFallback && brackets.length > 0 && (
                      <div className="mt-3 rounded-md border border-[var(--sage)]/40 bg-[color-mix(in_oklab,var(--sage)_8%,transparent)] px-3 py-2 text-[11px] text-[var(--sage)]">
                        Não existe tabela de retenção IRS carregada para <strong>{draft.ano_fiscal}</strong>. Foi usada automaticamente a tabela mais próxima disponível: <strong>{irsTableData.resolvedYear}</strong>.
                      </div>
                    )}
                    {brackets.length === 0 && (
                      <div className="mt-3 rounded-md border border-[var(--clay)]/40 bg-[color-mix(in_oklab,var(--clay)_8%,transparent)] px-3 py-2 text-[11px] text-[var(--clay)]">
                        Não há tabela de retenção IRS carregada para {draft.localizacao} · {TABELA_LABEL[tabela]}. Os valores aparecem a zero até existirem tabelas disponíveis.
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

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

function SaveStatus({
  isDirty, isSaving, lastSavedAt,
}: { isDirty: boolean; isSaving: boolean; lastSavedAt: Date | null }) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> A guardar…
      </span>
    );
  }
  if (isDirty) {
    return (
      <span className="text-[11px] text-[var(--clay)]">Alterações por guardar — clique em Guardar ficha</span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[var(--sage)]">
        <Check className="h-3 w-3" /> Guardado {lastSavedAt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  }
  return <span className="text-[11px] text-muted-foreground">Sem alterações</span>;
}
