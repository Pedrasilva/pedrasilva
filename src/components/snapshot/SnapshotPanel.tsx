import { useState } from "react";
import {
  computeSnapshot,
  fmtEUR,
  fmtPct,
  SUBSIDIOS_MODO_DESC,
  SUBSIDIOS_MODO_LABEL,
  type Snapshot,
  type SubsidiosModo,
} from "@/lib/salary";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { HelpCircle, Calendar, Wallet, TrendingUp, Building2 } from "lucide-react";

export type SnapshotPanelMode = "edit" | "readonly";

type Setter = <K extends keyof Snapshot>(k: K, v: Snapshot[K]) => void;

type Props = {
  draft: Snapshot;
  set?: Setter;
  mode?: SnapshotPanelMode;
};

export function SnapshotPanel({ draft, set, mode = "edit" }: Props) {
  const c = computeSnapshot(draft);
  const editable = mode === "edit" && !!set;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ESQUERDA — Inputs em acordeão */}
      <div className="space-y-4">
        <SimulationHeader draft={draft} set={set} editable={editable} />
        {editable ? (
          <InputsAccordion draft={draft} set={set!} />
        ) : (
          <ReadonlyInputs draft={draft} />
        )}
      </div>

      {/* DIREITA — Resultados destacados */}
      <div className="space-y-4">
        <IncomeHero c={c} draft={draft} />
        <KpiGrid c={c} />
        <ResultsBreakdown c={c} draft={draft} />
      </div>
    </div>
  );
}

/* ============================================================
 *  HEADER — Ano fiscal, modo de subsídios
 * ============================================================ */
function SimulationHeader({
  draft,
  set,
  editable,
}: {
  draft: Snapshot;
  set?: Setter;
  editable: boolean;
}) {
  return (
    <Card className="border-[var(--clay)]/30 bg-[color-mix(in_oklab,var(--cream)_55%,var(--background))]">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-[var(--clay)]" />
            Simulação ano fiscal {draft.ano_fiscal}
          </div>
          <span className="rounded-full bg-[var(--clay)]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--clay-deep,var(--clay))]">
            Tabelas IRS de Janeiro
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <LabelWithHelp
              label="Modo de pagamento dos subsídios"
              help={
                <div className="space-y-1.5">
                  <p>
                    <b>Tradicional</b> — subsídios de férias e Natal pagos integralmente em Junho e
                    Novembro (14 ordenados/ano).
                  </p>
                  <p>
                    <b>Duodécimos a 50%</b> — metade de cada subsídio é diluída pelos 12 meses; a
                    outra metade é paga em Jun/Nov.
                  </p>
                  <p>
                    <b>Duodécimos a 100%</b> — subsídios totalmente diluídos pelos 12 meses (sem
                    extras em Jun/Nov).
                  </p>
                </div>
              }
            />
            {editable ? (
              <Select
                value={draft.subsidios_modo}
                onValueChange={(v) => set!("subsidios_modo", v as SubsidiosModo)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SUBSIDIOS_MODO_LABEL) as SubsidiosModo[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SUBSIDIOS_MODO_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {SUBSIDIOS_MODO_LABEL[draft.subsidios_modo]}
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {SUBSIDIOS_MODO_DESC[draft.subsidios_modo]}
        </p>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 *  INPUTS — Acordeão estilo Doutor Finanças
 * ============================================================ */
function InputsAccordion({ draft, set }: { draft: Snapshot; set: Setter }) {
  return (
    <Accordion type="single" collapsible defaultValue="base" className="space-y-2">
      <AccordionItem
        value="base"
        className="rounded-lg border bg-card px-4 data-[state=open]:shadow-sm"
      >
        <AccordionTrigger className="text-sm font-medium hover:no-underline">
          Base contractual
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 pb-2">
            <NumField
              label="Vencimento base mensal"
              suffix="€"
              value={draft.valor_base}
              onChange={(n) => set("valor_base", n)}
              help="Salário ilíquido (bruto) por mês definido no contrato, sem subsídios nem benefícios."
            />
            <NumField
              label="Meses pagos por ano"
              value={draft.meses_pagos}
              onChange={(n) => set("meses_pagos", n)}
              step={1}
              help="Tipicamente 14 (12 ordenados + subsídio de férias + subsídio de Natal). Em duodécimos mantém-se 14, mas a distribuição mensal muda."
            />
            <NumField
              label="Segurança Social — colaborador"
              suffix="%"
              value={draft.ss_colaborador_pct * 100}
              onChange={(n) => set("ss_colaborador_pct", n / 100)}
              step={0.01}
              help="Taxa única de retenção do colaborador (TSU). Por defeito 11%."
            />
            <NumField
              label="Segurança Social — empregador (TSU)"
              suffix="%"
              value={draft.ss_atelier_pct * 100}
              onChange={(n) => set("ss_atelier_pct", n / 100)}
              step={0.01}
              help="Encargo do empregador sobre a remuneração base. Por defeito 23,75%."
            />
            {!draft.irs_calculado_auto && (
              <NumField
                label="Taxa IRS manual"
                suffix="%"
                value={draft.irs_pct * 100}
                onChange={(n) => set("irs_pct", n / 100)}
                step={0.1}
                help="Quando o cálculo automático está desligado, indique aqui a taxa de retenção do IRS aplicável."
              />
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="alimentacao"
        className="rounded-lg border bg-card px-4 data-[state=open]:shadow-sm"
      >
        <AccordionTrigger className="text-sm font-medium hover:no-underline">
          Subsídio de alimentação
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 pb-2">
            <NumField
              label="Valor diário"
              suffix="€"
              value={draft.subsidio_alimentacao_diario}
              onChange={(n) => set("subsidio_alimentacao_diario", n)}
              help="Valor por dia útil trabalhado. Em cartão refeição é isento até ao limite legal; em dinheiro a parte excedente paga IRS e SS."
            />
            <NumField
              label="Dias úteis no ano"
              value={draft.dias_uteis}
              onChange={(n) => set("dias_uteis", n)}
              step={1}
              help="Dias de trabalho efectivo por ano (já descontados feriados, fins-de-semana e férias). Definição centralizada na página Dias Úteis."
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="ajudas"
        className="rounded-lg border bg-card px-4 data-[state=open]:shadow-sm"
      >
        <AccordionTrigger className="text-sm font-medium hover:no-underline">
          Ajudas de custo
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 pb-2">
            <NumField
              label="Valor anual"
              suffix="€"
              value={draft.ajudas_custo_anual}
              onChange={(n) => set("ajudas_custo_anual", n)}
              help="Compensações pagas para cobrir despesas de deslocação/estadia. Isentas de IRS e SS dentro dos limites legais."
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="beneficios"
        className="rounded-lg border bg-card px-4 data-[state=open]:shadow-sm"
      >
        <AccordionTrigger className="text-sm font-medium hover:no-underline">
          Benefícios complementares
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 pb-2">
            <NumField
              label="Apoio carro"
              suffix="€"
              value={draft.beneficio_carro}
              onChange={(n) => set("beneficio_carro", n)}
              help="Valor anual atribuído para apoio a transporte/viatura."
            />
            <NumField
              label="Ticket / cartão complementar"
              suffix="€"
              value={draft.beneficio_ticket}
              onChange={(n) => set("beneficio_ticket", n)}
              help="Tickets, cartões de descontos ou outros benefícios em espécie."
            />
            <NumField
              label="Prémio de associado"
              suffix="€"
              value={draft.premio_associado}
              onChange={(n) => set("premio_associado", n)}
              help="Bónus anual ligado ao desempenho ou estatuto de associado."
            />
            <NumField
              label="Outros benefícios"
              suffix="€"
              value={draft.outros_beneficios}
              onChange={(n) => set("outros_beneficios", n)}
              help="Qualquer outro benefício anual não classificado acima."
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function ReadonlyInputs({ draft }: { draft: Snapshot }) {
  const c = computeSnapshot(draft);
  return (
    <Card>
      <CardContent className="space-y-2 pt-5 text-sm">
        <ReadRow label="Vencimento base" value={fmtEUR(draft.valor_base)} />
        <ReadRow label="Meses pagos" value={String(draft.meses_pagos)} />
        <ReadRow label="Subsídio alimentação" value={`${fmtEUR(draft.subsidio_alimentacao_diario)} / dia × ${draft.dias_uteis} dias`} />
        <ReadRow label="Ajudas de custo (anual)" value={fmtEUR(draft.ajudas_custo_anual)} />
        <ReadRow label="Benefícios (anual)" value={fmtEUR(c.beneficiosAnual)} />
        <ReadRow label="SS colaborador" value={fmtPct(draft.ss_colaborador_pct)} />
        <ReadRow label="SS empregador (TSU)" value={fmtPct(draft.ss_atelier_pct)} />
      </CardContent>
    </Card>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

/* ============================================================
 *  RESULTADOS — Hero + KPIs + Breakdown
 * ============================================================ */
function IncomeHero({
  c,
  draft,
}: {
  c: ReturnType<typeof computeSnapshot>;
  draft: Snapshot;
}) {
  const [view, setView] = useState<"normal" | "subsidio">("normal");
  const showToggle = c.subsidiosCount > 0 && c.fraccaoExtra > 0;
  const value = view === "normal" ? c.takeHomeMesNormal : c.takeHomeMesComSubsidio;
  const liquidoValue = view === "normal" ? c.liquidoMesNormal : c.liquidoMesComSubsidio;

  return (
    <Card className="overflow-hidden border-[var(--clay)]/40">
      <div className="bg-gradient-to-br from-[color-mix(in_oklab,var(--clay)_85%,white)] to-[color-mix(in_oklab,var(--clay)_60%,white)] p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-white/85">
              {view === "normal" ? "Recebe ao mês (mês normal)" : "Recebe ao mês (com subsídio)"}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums sm:text-4xl">
              {fmtEUR(value)}
            </div>
            <div className="mt-1 text-xs text-white/80">
              Líquido salarial: <span className="font-semibold tabular-nums">{fmtEUR(liquidoValue)}</span>
              {" + alimentação "}
              <span className="font-semibold tabular-nums">{fmtEUR(c.alimentacaoMensal)}</span>
              {c.ajudasMensal > 0 && (
                <>
                  {" + ajudas "}
                  <span className="font-semibold tabular-nums">{fmtEUR(c.ajudasMensal)}</span>
                </>
              )}
            </div>
          </div>
          <Wallet className="h-7 w-7 shrink-0 text-white/70" />
        </div>
        {showToggle && (
          <Tabs value={view} onValueChange={(v) => setView(v as "normal" | "subsidio")} className="mt-4">
            <TabsList className="h-8 bg-white/20 backdrop-blur-sm">
              <TabsTrigger value="normal" className="h-7 text-[11px] data-[state=active]:bg-white data-[state=active]:text-[color:var(--clay)]">
                Mês normal ({12 - (draft.subsidios_modo === "duodecimos_100" ? 0 : c.subsidiosCount)} ×)
              </TabsTrigger>
              <TabsTrigger value="subsidio" className="h-7 text-[11px] data-[state=active]:bg-white data-[state=active]:text-[color:var(--clay)]">
                Mês c/ subsídio ({c.subsidiosCount} ×)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      <CardContent className="grid grid-cols-3 gap-2 bg-card p-4 text-center">
        <MiniStat label="Líquido anual" value={fmtEUR(c.liquidoAnual + c.alimentacaoAnual + c.ajudasMensal * 12)} />
        <MiniStat label="Bruto anual" value={fmtEUR(c.brutoAnual)} />
        <MiniStat label="% Retenção" value={fmtPct(c.pctRetencao)} hint="IRS + SS sobre o bruto base" />
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="rounded-md bg-muted/40 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
          </div>
        </TooltipTrigger>
        {hint && <TooltipContent className="max-w-[220px] text-xs">{hint}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}

function KpiGrid({ c }: { c: ReturnType<typeof computeSnapshot> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <KpiCard
        icon={<Building2 className="h-4 w-4" />}
        title="Custo total empregador"
        primary={fmtEUR(c.custoVBG)}
        secondary={`≈ ${fmtEUR(c.custoVBG / 12)} / mês`}
        tone="ink"
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        title="Bruto mensal médio (12)"
        primary={fmtEUR(c.brutoMensal)}
        secondary={`Anual: ${fmtEUR(c.brutoAnual)}`}
        tone="sage"
      />
    </div>
  );
}

const TONE_CLS = {
  ink: "border-[var(--ink)]/25 bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]",
  sage: "border-[var(--sage)]/30 bg-[color-mix(in_oklab,var(--sage)_5%,transparent)]",
  clay: "border-[var(--clay)]/35 bg-[color-mix(in_oklab,var(--clay)_5%,transparent)]",
} as const;

function KpiCard({
  icon,
  title,
  primary,
  secondary,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary?: string;
  tone: keyof typeof TONE_CLS;
}) {
  return (
    <div className={`rounded-lg border p-4 ${TONE_CLS[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{primary}</div>
      {secondary && <div className="text-[11px] text-muted-foreground">{secondary}</div>}
    </div>
  );
}

function ResultsBreakdown({
  c,
  draft,
}: {
  c: ReturnType<typeof computeSnapshot>;
  draft: Snapshot;
}) {
  const [tab, setTab] = useState<"liquido" | "bruto">("liquido");

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "liquido" | "bruto")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="liquido">Detalhe líquido</TabsTrigger>
            <TabsTrigger value="bruto">Detalhe bruto</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "liquido" ? (
          <BreakdownTable
            rows={[
              { label: "Vencimento base", value: c.base, kind: "input" },
              { label: "− Segurança Social colaborador", value: -c.ssColaboradorMensal, hint: `${fmtPct(draft.ss_colaborador_pct)} × base` },
              { label: "− IRS retido", value: -c.irsMensal, hint: draft.irs_calculado_auto ? "Cálculo automático com base no agregado familiar" : `${fmtPct(draft.irs_pct)} × base` },
              { label: "Líquido por mês de pagamento", value: c.liquido14m, kind: "subtotal" },
              { label: `× ${c.meses} meses pagos`, value: c.liquidoAnual, kind: "subtotal" },
              { label: "+ Subsídio alimentação anual", value: c.alimentacaoAnual, hint: `${fmtEUR(draft.subsidio_alimentacao_diario)} × ${draft.dias_uteis} dias` },
              { label: "+ Ajudas de custo", value: draft.ajudas_custo_anual },
              { label: "Total líquido anual", value: c.liquidoAnual + c.alimentacaoAnual + draft.ajudas_custo_anual, kind: "total" },
            ]}
          />
        ) : (
          <BreakdownTable
            rows={[
              { label: "Vencimento base anual", value: c.baseAnual, kind: "input", hint: `${fmtEUR(c.base)} × ${c.meses}` },
              { label: "+ TSU empregador", value: c.ssAtelierAnual, hint: `${fmtPct(draft.ss_atelier_pct)} × base anual` },
              { label: "+ Subsídio alimentação anual", value: c.alimentacaoAnual },
              { label: "+ Ajudas de custo", value: draft.ajudas_custo_anual },
              { label: "+ Benefícios complementares", value: c.beneficiosAnual },
              { label: "Custo total empregador (VBG)", value: c.custoVBG, kind: "total" },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  rows,
}: {
  rows: { label: string; value: number; kind?: "input" | "subtotal" | "total"; hint?: string }[];
}) {
  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const isTotal = r.kind === "total";
        const isSub = r.kind === "subtotal";
        return (
          <div
            key={i}
            className={
              "flex items-baseline justify-between gap-3 px-2 py-1.5 " +
              (isTotal
                ? "mt-1 rounded-md bg-[color-mix(in_oklab,var(--clay)_8%,transparent)] font-semibold"
                : isSub
                  ? "border-y border-dashed border-border/60 font-medium"
                  : "")
            }
          >
            <div className="min-w-0">
              <div className="text-sm">{r.label}</div>
              {r.hint && (
                <div className="text-[10px] text-muted-foreground">{r.hint}</div>
              )}
            </div>
            <div
              className={
                "shrink-0 tabular-nums " +
                (isTotal
                  ? "text-base"
                  : r.value < 0
                    ? "text-sm text-[color:var(--negative,#b04545)]"
                    : "text-sm")
              }
            >
              {fmtEUR(r.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
 *  Helpers — campo numérico com tooltip
 * ============================================================ */
function NumField({
  label,
  value,
  onChange,
  step = 0.01,
  suffix,
  help,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <LabelWithHelp label={label} help={help} />
      <div className="relative">
        <Input
          type="number"
          step={step}
          className="input-yellow pr-8 text-right tabular-nums"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function LabelWithHelp({ label, help }: { label: string; help?: React.ReactNode }) {
  if (!help) return <Label className="text-xs text-muted-foreground">{label}</Label>;
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground/70 transition-colors hover:text-foreground"
              aria-label="Ajuda"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px] text-xs leading-relaxed">
            {help}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
