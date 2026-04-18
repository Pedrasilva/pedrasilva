import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import { CompositionDonut } from "./SalaryDonut";

export function BrutoTab({ draft }: { draft: Snapshot }) {
  const c = computeSnapshot(draft);
  const [period, setPeriod] = useState<"anual" | "mensal">("anual");
  const rows = [
    { label: "Base mensal (anualizada/12)", value: c.baseMensal12 },
    { label: "+ SS Atelier mensal (anualizada/12)", value: c.ssAtelier12 },
    { label: "+ Subsídio alimentação mensal", value: c.alimentacaoMensal },
    { label: "+ Ajudas de custo mensais", value: c.ajudasMensal },
    { label: "= Bruto mensal (custo equivalente)", value: c.brutoMensal, strong: true },
    { label: "× 12", value: c.brutoMensal * 12 },
    { label: "+ Benefícios anuais", value: c.beneficiosAnual },
    { label: "= Bruto anual", value: c.brutoAnual, strong: true },
    { label: "+ Ajudas de custo anuais", value: draft.ajudas_custo_anual },
    { label: "= Custo total RH (VBG)", value: c.custoVBG, strong: true, accent: true },
  ];

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
                className={`flex items-baseline justify-between py-2 ${r.strong ? "font-semibold" : ""} ${r.accent ? "text-[var(--clay)]" : ""}`}
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
