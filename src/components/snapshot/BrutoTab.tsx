import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import { CompositionDonut } from "./SalaryDonut";

export function BrutoTab({ draft }: { draft: Snapshot }) {
  const c = computeSnapshot(draft);
  const [period, setPeriod] = useState<"anual" | "mensal">("anual");

  // Estrutura por regime (espelha Visão Líquido):
  // - tradicional (14m): custo base + subsídios pagos por inteiro em Jun/Nov
  // - duodecimos_50 (13m): metade diluída em duodécimos + metade paga por inteiro
  // - duodecimos_100 (12m): subsídios totalmente diluídos em duodécimos
  const modo = draft.subsidios_modo ?? "tradicional";

  // Custo bruto da empresa para UM mês de salário (base + SS Atelier)
  // Equivale a UM subsídio do ponto de vista do custo total
  const custoMesBase = c.base + c.ssAtelierMensal;

  // Duodécimos mensais do custo bruto (parte dos subsídios diluída em 12 meses)
  const duodecimosBrutoMensal =
    modo === "duodecimos_100"
      ? (custoMesBase * 2) / 12
      : modo === "duodecimos_50"
        ? custoMesBase / 12
        : 0;

  // Subsídio pago por inteiro (custo bruto, Junho/Novembro)
  const subsidioBrutoInteiro =
    modo === "duodecimos_100"
      ? 0
      : modo === "duodecimos_50"
        ? custoMesBase / 2
        : custoMesBase;

  const brutoBaseMensal = custoMesBase;
  const brutoMensalMedio = brutoBaseMensal + duodecimosBrutoMensal;

  const rows: Array<{ label: string; value: number; strong?: boolean; accent?: boolean; muted?: boolean }> = [
    { label: "Valor base mensal", value: c.base },
    { label: "+ SS Atelier (mensal)", value: c.ssAtelierMensal },
    { label: "= Custo base mensal", value: brutoBaseMensal, strong: true },
  ];

  if (modo === "duodecimos_100") {
    rows.push({
      label: "+ Duodécimos (subsídios férias + Natal diluídos em 12 meses)",
      value: duodecimosBrutoMensal,
    });
  } else if (modo === "duodecimos_50") {
    rows.push(
      {
        label: "+ Duodécimos (50% dos subsídios diluídos em 12 meses)",
        value: duodecimosBrutoMensal,
      },
      {
        label: "+ Subsídio de férias (50% pago por inteiro em Junho)",
        value: subsidioBrutoInteiro,
        muted: true,
      },
      {
        label: "+ Subsídio de Natal (50% pago por inteiro em Novembro)",
        value: subsidioBrutoInteiro,
        muted: true,
      },
    );
  } else {
    rows.push(
      {
        label: "+ Subsídio de férias (pago por inteiro em Junho)",
        value: subsidioBrutoInteiro,
        muted: true,
      },
      {
        label: "+ Subsídio de Natal (pago por inteiro em Novembro)",
        value: subsidioBrutoInteiro,
        muted: true,
      },
    );
  }

  rows.push(
    {
      label: "= Custo bruto mensal médio",
      value: brutoMensalMedio,
      strong: true,
    },
    { label: "+ Subsídio alimentação mensal", value: c.alimentacaoMensal },
    { label: "+ Ajudas de custo mensais", value: c.ajudasMensal },
    { label: "+ Benefícios mensais", value: c.beneficiosMensal },
    {
      label: "= Custo total RH mensal (VBG)",
      value: brutoMensalMedio + c.alimentacaoMensal + c.ajudasMensal + c.beneficiosMensal,
      strong: true,
      accent: true,
    },
  );

  const annualSlices = [
    { name: "Base anual", value: c.baseMensal12 * 12, color: "var(--sage)" },
    { name: "SS Atelier", value: c.ssAtelier12 * 12, color: "var(--clay)" },
    { name: "Subsídio alimentação", value: c.alimentacaoMensal * 12, color: "oklch(0.75 0.10 80)" },
    { name: "Ajudas de custo", value: draft.ajudas_custo_anual, color: "oklch(0.65 0.13 50)" },
    { name: "Benefícios", value: c.beneficiosAnual, color: "oklch(0.55 0.10 200)" },
  ];

  const monthlySlices = [
    { name: "Base mensal", value: c.baseMensal12, color: "var(--sage)" },
    { name: "SS Atelier", value: c.ssAtelier12, color: "var(--clay)" },
    { name: "Subsídio alimentação", value: c.alimentacaoMensal, color: "oklch(0.75 0.10 80)" },
    { name: "Ajudas de custo", value: c.ajudasMensal, color: "oklch(0.65 0.13 50)" },
    { name: "Benefícios", value: c.beneficiosMensal, color: "oklch(0.55 0.10 200)" },
  ];

  const isAnual = period === "anual";
  const slices = isAnual ? annualSlices : monthlySlices;
  const centerLabel = isAnual ? "Custo VBG" : "Custo VBG mensal";
  const centerValue = isAnual ? c.custoVBG : c.custoVBG / 12;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visão Bruto</CardTitle>
          <CardDescription>Custo total para o atelier ao longo do ano.</CardDescription>
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
              <CardTitle className="text-base">Composição {isAnual ? "anual" : "mensal"}</CardTitle>
              <CardDescription>Custo RH (VBG) decomposto.</CardDescription>
            </div>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as "anual" | "mensal")}>
              <TabsList className="h-8">
                <TabsTrigger value="anual" className="h-6 px-2 text-xs">Anual</TabsTrigger>
                <TabsTrigger value="mensal" className="h-6 px-2 text-xs">Mensal</TabsTrigger>
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
