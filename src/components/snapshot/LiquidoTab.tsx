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

  // Decomposição dos subsídios de férias e Natal consoante o regime:
  // - tradicional (14m): subsídios pagos por inteiro (ambos = 1× líquido mensal cada)
  // - duodecimos_50 (13m): metade diluída + metade por inteiro (cada subsídio = 0.5× líquido)
  // - duodecimos_100 (12m): totalmente diluídos (nada por inteiro extra)
  const modo = draft.subsidios_modo ?? "tradicional";
  const subsidioFeriasAnual =
    modo === "duodecimos_100" ? 0 : modo === "duodecimos_50" ? c.liquido14m * 0.5 : c.liquido14m;
  const subsidioNatalAnual = subsidioFeriasAnual;
  const subsidioFeriasMensal = subsidioFeriasAnual / 12;
  const subsidioNatalMensal = subsidioNatalAnual / 12;

  const modoLabel =
    modo === "duodecimos_100"
      ? "100% duodécimos"
      : modo === "duodecimos_50"
        ? "50% duodécimos"
        : "tradicional";

  // Líquido base de 12 meses (sem subsídios), para deixar claro o que entra
  const liquidoBase12 = c.liquido14m; // mesma fórmula: base − SS − IRS

  const rows: Array<{ label: string; value: number; raw?: string; strong?: boolean; accent?: boolean; muted?: boolean }> = [
    { label: "Valor base mensal", value: c.base },
    { label: "− SS Colaborador (mensal)", value: -c.ssColaboradorMensal },
    { label: "− IRS (mensal)", value: -c.irsMensal },
    { label: "= Líquido base mensal (12 meses)", value: liquidoBase12, strong: true },
    {
      label: `+ Subsídio de férias (${modoLabel}, ÷12)`,
      value: subsidioFeriasMensal,
      muted: subsidioFeriasMensal === 0,
    },
    {
      label: `+ Subsídio de Natal (${modoLabel}, ÷12)`,
      value: subsidioNatalMensal,
      muted: subsidioNatalMensal === 0,
    },
    { label: "= Líquido mensal médio (com subsídios)", value: c.liquido12m, strong: true },
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
                className={`flex items-baseline justify-between py-2 ${r.strong ? "font-semibold" : ""} ${r.accent ? "text-[var(--sage)]" : ""} ${r.muted ? "text-muted-foreground" : ""}`}
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
