import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import { CompositionDonut } from "./SalaryDonut";

export function BrutoTab({ draft }: { draft: Snapshot }) {
  const { t } = useTranslation("hr");
  const c = computeSnapshot(draft);
  const [period, setPeriod] = useState<"anual" | "mensal">("anual");

  // Estrutura por regime (espelha Visão Líquido):
  // - tradicional (14m): custo base + subsídios pagos por inteiro em Jun/Nov
  // - duodecimos_50 (13m): metade diluída em duodécimos + metade paga por inteiro
  // - duodecimos_100 (12m): subsídios totalmente diluídos em duodécimos
  // SS Atelier já incide sobre a base mensal tributável (inclui duodécimos).
  const modo = draft.subsidios_modo ?? "tradicional";

  // Parte dos subsídios diluída na base mensal
  const duodecimosMensal = c.baseMensalTributavel - c.base;
  const ssAtelierSobreBase = c.base * draft.ss_atelier_pct;

  // Custo bruto da empresa para UM subsídio inteiro (pago em Jun/Nov)
  const custoSubsidioInteiro = c.base + ssAtelierSobreBase;
  const subsidioBrutoInteiro =
    modo === "duodecimos_100"
      ? 0
      : modo === "duodecimos_50"
        ? custoSubsidioInteiro / 2
        : custoSubsidioInteiro;

  const brutoMensalMedio = c.baseMensalTributavel + c.ssAtelierMensal;

  const rows: Array<{ label: string; value: number; strong?: boolean; accent?: boolean; muted?: boolean }> = [
    { label: t("snapshot.bruto.rows.baseMonthly"), value: c.base },
  ];

  if (duodecimosMensal > 0.005) {
    rows.push({
      label:
        modo === "duodecimos_100"
          ? t("snapshot.bruto.rows.duodecimos100")
          : t("snapshot.bruto.rows.duodecimos50"),
      value: duodecimosMensal,
    });
    rows.push({
      label: t("snapshot.bruto.rows.taxableBase"),
      value: c.baseMensalTributavel,
      strong: true,
    });
    rows.push({
      label: t("snapshot.bruto.rows.ssAtelierMonthlyOverBase"),
      value: c.ssAtelierMensal,
    });
  } else {
    rows.push({
      label: t("snapshot.bruto.rows.ssAtelierMonthly"),
      value: c.ssAtelierMensal,
    });
  }

  rows.push({
    label: t("snapshot.bruto.rows.grossMonthlyCost"),
    value: brutoMensalMedio,
    strong: true,
  });

  if (modo === "duodecimos_50") {
    rows.push(
      {
        label: t("snapshot.bruto.rows.vacationFullJune50"),
        value: subsidioBrutoInteiro,
        muted: true,
      },
      {
        label: t("snapshot.bruto.rows.christmasFullNovember50"),
        value: subsidioBrutoInteiro,
        muted: true,
      },
    );
  } else if (modo === "tradicional") {
    rows.push(
      {
        label: t("snapshot.bruto.rows.vacationFullJune"),
        value: subsidioBrutoInteiro,
        muted: true,
      },
      {
        label: t("snapshot.bruto.rows.christmasFullNovember"),
        value: subsidioBrutoInteiro,
        muted: true,
      },
    );
  }

  rows.push(
    { label: t("snapshot.bruto.rows.mealAllowanceMonthly"), value: c.alimentacaoMensal },
    { label: t("snapshot.bruto.rows.perDiemMonthly"), value: c.ajudasMensal },
    { label: t("snapshot.bruto.rows.benefitsMonthly"), value: c.beneficiosMensal },
    {
      label: t("snapshot.bruto.rows.totalHrCostMonthly"),
      value: brutoMensalMedio + c.alimentacaoMensal + c.ajudasMensal + c.beneficiosMensal,
      strong: true,
      accent: true,
    },
  );

  const annualSlices = [
    { name: t("snapshot.bruto.composition.slices.baseAnnual"), value: c.baseMensal12 * 12, color: "var(--sage)" },
    { name: t("snapshot.bruto.composition.slices.ssAtelier"), value: c.ssAtelier12 * 12, color: "var(--clay)" },
    { name: t("snapshot.bruto.composition.slices.mealAllowance"), value: c.alimentacaoMensal * 12, color: "oklch(0.75 0.10 80)" },
    { name: t("snapshot.bruto.composition.slices.perDiem"), value: draft.ajudas_custo_anual, color: "oklch(0.65 0.13 50)" },
    { name: t("snapshot.bruto.composition.slices.benefits"), value: c.beneficiosAnual, color: "oklch(0.55 0.10 200)" },
  ];

  const monthlySlices = [
    { name: t("snapshot.bruto.composition.slices.baseMonthly"), value: c.baseMensal12, color: "var(--sage)" },
    { name: t("snapshot.bruto.composition.slices.ssAtelier"), value: c.ssAtelier12, color: "var(--clay)" },
    { name: t("snapshot.bruto.composition.slices.mealAllowance"), value: c.alimentacaoMensal, color: "oklch(0.75 0.10 80)" },
    { name: t("snapshot.bruto.composition.slices.perDiem"), value: c.ajudasMensal, color: "oklch(0.65 0.13 50)" },
    { name: t("snapshot.bruto.composition.slices.benefits"), value: c.beneficiosMensal, color: "oklch(0.55 0.10 200)" },
  ];

  const isAnual = period === "anual";
  const slices = isAnual ? annualSlices : monthlySlices;
  const centerLabel = isAnual
    ? t("snapshot.bruto.composition.centerAnnual")
    : t("snapshot.bruto.composition.centerMonthly");
  const centerValue = isAnual ? c.custoVBG : c.custoVBG / 12;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("snapshot.bruto.title")}</CardTitle>
          <CardDescription>{t("snapshot.bruto.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {rows.map((r) => (
              <div
                key={r.label}
                className={`flex items-baseline justify-between py-2 ${r.strong ? "font-semibold" : ""} ${r.accent ? "text-[var(--clay)]" : ""} ${r.muted ? "text-muted-foreground" : ""}`}
              >
                <span className="text-sm">{r.label}</span>
                <span className="font-mono tabular-nums">{fmtEUR(r.value)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {isAnual
                  ? t("snapshot.bruto.composition.annualTitle")
                  : t("snapshot.bruto.composition.monthlyTitle")}
              </CardTitle>
              <CardDescription>{t("snapshot.bruto.composition.description")}</CardDescription>
            </div>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as "anual" | "mensal")}>
              <TabsList className="h-8">
                <TabsTrigger value="anual" className="h-6 px-2 text-xs">
                  {t("snapshot.bruto.composition.annualToggle")}
                </TabsTrigger>
                <TabsTrigger value="mensal" className="h-6 px-2 text-xs">
                  {t("snapshot.bruto.composition.monthlyToggle")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <CompositionDonut
            centerLabel={centerLabel}
            centerValue={centerValue}
            slices={slices}
          />
        </CardContent>
      </Card>
    </div>
  );
}
