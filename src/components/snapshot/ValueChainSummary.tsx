import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtEUR, type Computed } from "@/lib/salary";

type Period = "mensal" | "anual";

export function ValueChainSummary({ c }: { c: Computed }) {
  const { t } = useTranslation("hr");
  const [period, setPeriod] = useState<Period>("mensal");
  const isAnual = period === "anual";
  const mult = isAnual ? 12 : 1;

  // Custo total empregador (já anual no compute)
  const custoEmpregadorAnual = c.custoVBG;
  const custoEmpregador = isAnual ? custoEmpregadorAnual : custoEmpregadorAnual / 12;

  // Estado recebe = SS Atelier + SS Colaborador + IRS
  const estadoMensal = c.ssAtelierMensal + c.ssColaboradorMensal + c.irsMensal;
  const estado = estadoMensal * mult;
  const ssAtelier = c.ssAtelierMensal * mult;
  const ssColab = c.ssColaboradorMensal * mult;
  const irs = c.irsMensal * mult;

  // Colaborador leva = líquido total mensal (já inclui alimentação + ajudas)
  const colaborador = c.liquidoTotalMensal * mult;

  const safeBase = custoEmpregador > 0 ? custoEmpregador : 1;
  const pctColab = (colaborador / safeBase) * 100;
  const pctEstado = (estado / safeBase) * 100;

  const periodLabel = isAnual
    ? t("snapshot.valueChain.period.perYear")
    : t("snapshot.valueChain.period.perMonth");

  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("snapshot.valueChain.eyebrow")}
            </div>
            <div className="text-sm text-muted-foreground">
              {t("snapshot.valueChain.subtitle")}
            </div>
          </div>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="h-8">
              <TabsTrigger value="mensal" className="h-6 px-2.5 text-xs">
                {t("snapshot.bruto.composition.monthlyToggle")}
              </TabsTrigger>
              <TabsTrigger value="anual" className="h-6 px-2.5 text-xs">
                {t("snapshot.bruto.composition.annualToggle")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {/* Custo empregador */}
          <ChainNode
            label={t("snapshot.valueChain.nodes.employerCost.label")}
            value={fmtEUR(custoEmpregador)}
            periodLabel={periodLabel}
            tone="clay"
            sublines={[
              { label: t("snapshot.valueChain.nodes.employerCost.subline"), value: "100%" },
            ]}
          />

          <Connector />

          {/* Colaborador leva */}
          <ChainNode
            label={t("snapshot.valueChain.nodes.employeeTakeHome.label")}
            value={fmtEUR(colaborador)}
            periodLabel={periodLabel}
            tone="sage"
            badge={`${pctColab.toFixed(1)}%`}
            sublines={[
              { label: t("snapshot.valueChain.nodes.employeeTakeHome.subline"), value: "" },
            ]}
          />

          <Connector />

          {/* Estado recebe */}
          <ChainNode
            label={t("snapshot.valueChain.nodes.stateReceives.label")}
            value={fmtEUR(estado)}
            periodLabel={periodLabel}
            tone="ink"
            badge={`${pctEstado.toFixed(1)}%`}
            sublines={[
              { label: t("snapshot.valueChain.nodes.stateReceives.ssStudio"), value: fmtEUR(ssAtelier) },
              { label: t("snapshot.valueChain.nodes.stateReceives.ssEmployee"), value: fmtEUR(ssColab) },
              { label: t("snapshot.valueChain.nodes.stateReceives.incomeTaxWithheld"), value: fmtEUR(irs) },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const toneCls = {
  sage: "border-[var(--sage)]/40 bg-[color-mix(in_oklab,var(--sage)_10%,transparent)]",
  clay: "border-[var(--clay)]/40 bg-[color-mix(in_oklab,var(--clay)_10%,transparent)]",
  ink: "border-border bg-muted/40",
} as const;

const badgeCls = {
  sage: "bg-[var(--sage)]/15 text-[var(--sage)] border-[var(--sage)]/30",
  clay: "bg-[var(--clay)]/15 text-[var(--clay)] border-[var(--clay)]/30",
  ink: "bg-muted text-foreground/70 border-border",
} as const;

function ChainNode({
  label,
  value,
  periodLabel,
  tone,
  badge,
  sublines,
}: {
  label: string;
  value: string;
  periodLabel: string;
  tone: keyof typeof toneCls;
  badge?: string;
  sublines?: { label: string; value: string }[];
}) {
  return (
    <div className={`flex flex-col rounded-lg border ${toneCls[tone]} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        {badge && (
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${badgeCls[tone]}`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{periodLabel}</span>
      </div>
      {sublines && sublines.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/50 pt-2">
          {sublines.map((s) => (
            <li
              key={s.label}
              className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground"
            >
              <span className="truncate">{s.label}</span>
              {s.value && <span className="font-mono tabular-nums">{s.value}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center justify-center text-muted-foreground/60">
      <ArrowRight className="hidden h-5 w-5 md:block" aria-hidden />
      <div className="h-px w-full bg-border md:hidden" aria-hidden />
    </div>
  );
}
