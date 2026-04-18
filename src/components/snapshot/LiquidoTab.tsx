import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import { SalaryDonut } from "./SalaryDonut";

export function LiquidoTab({ draft }: { draft: Snapshot }) {
  const c = computeSnapshot(draft);
  const [period, setPeriod] = useState<"mensal" | "anual">("mensal");
  const isAnual = period === "anual";
  const mult = isAnual ? c.meses : 1;

  const rows = [
    { label: "Valor base mensal", value: c.base },
    { label: "− SS Colaborador (mensal)", value: -c.ssColaboradorMensal },
    { label: "− IRS (mensal)", value: -c.irsMensal },
    { label: "= Líquido (por mês de pagamento)", value: c.liquido14m, strong: true },
    { label: "× Meses pagos", value: c.meses, raw: `${c.meses}` },
    { label: "= Líquido anual", value: c.liquidoAnual, strong: true },
    { label: "÷ 12 (Líquido mensal médio)", value: c.liquido12m },
    { label: "+ Subsídio alimentação mensal", value: c.alimentacaoMensal },
    { label: "+ Ajudas de custo mensais", value: c.ajudasMensal },
    { label: "= Líquido total mensal", value: c.liquidoTotalMensal, strong: true, accent: true },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visão Líquido</CardTitle>
          <CardDescription>O que entra na conta do colaborador.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {rows.map((r) => (
              <div
                key={r.label}
                className={`flex items-baseline justify-between py-2 ${r.strong ? "font-semibold" : ""} ${r.accent ? "text-[var(--sage)]" : ""}`}
              >
                <span className="text-sm">{r.label}</span>
                <span className="font-mono tabular-nums">
                  {r.raw ?? fmtEUR(r.value)}
                </span>
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
              <CardDescription>Bruto decomposto.</CardDescription>
            </div>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as "mensal" | "anual")}>
              <TabsList className="h-8">
                <TabsTrigger value="mensal" className="h-6 px-2 text-xs">Mensal</TabsTrigger>
                <TabsTrigger value="anual" className="h-6 px-2 text-xs">Anual</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <SalaryDonut
            liquido={c.liquido14m * mult}
            ssColaborador={c.ssColaboradorMensal * mult}
            irs={c.irsMensal * mult}
            brutoMensalGlobal={isAnual ? c.brutoMensal * c.meses : c.brutoMensal}
            ssAtelierMensal={c.ssAtelier12 * mult}
            liquidoTotalMensal={c.liquidoTotalMensal * mult}
            periodLabel={isAnual ? "anual" : "mensal"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
