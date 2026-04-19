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

  // Mostramos sempre o valor líquido de cada subsídio (independente do regime),
  // calculado como líquido mensal × proporção correspondente:
  // - tradicional (14m): cada subsídio = c.liquido14m (1 mês cheio diluído em 12)
  // - duodecimos_50 (13m): cada subsídio = c.liquido14m / 2 (metade cheia + metade diluída)
  // - duodecimos_100 (12m): cada subsídio = c.liquido14m (totalmente diluído)
  // Para que a soma feche, ajustamos o "Líquido base mensal" exibido em função do regime.
  const modo = draft.subsidios_modo ?? "tradicional";

  // Subsídio mensal "teórico" (sempre o valor líquido de um mês de salário)
  const subsidioFeriasMensal = c.liquido14m;
  const subsidioNatalMensal = c.liquido14m;

  // Líquido base apresentado: o que falta para fechar c.liquido12m depois de somar os subsídios
  // tradicional (meses=14): liquido12m = liquido14m × 14/12 → base = liquido14m × (14/12) − 2×liquido14m = liquido14m × (−10/12) ❌
  // Esta abordagem não fecha. Em vez disso, mostramos o líquido base = c.liquido14m
  // e indicamos que os subsídios são adicionais (regime tradicional/50%) ou já incluídos (100%).
  const liquidoBase12 = c.liquido14m;

  const modoHint =
    modo === "duodecimos_100"
      ? "diluído nos 12 meses (já incluído no líquido base)"
      : modo === "duodecimos_50"
        ? "50% diluído · 50% pago em Junho/Novembro"
        : "pago por inteiro em Junho/Novembro";

  const subsidiosJaIncluidos = modo === "duodecimos_100";

  const rows: Array<{ label: string; value: number; raw?: string; strong?: boolean; accent?: boolean; muted?: boolean }> = [
    { label: "Valor base mensal", value: c.base },
    { label: "− SS Colaborador (mensal)", value: -c.ssColaboradorMensal },
    { label: "− IRS (mensal)", value: -c.irsMensal },
    { label: "= Líquido base mensal", value: liquidoBase12, strong: true },
    {
      label: `+ Subsídio de férias (${modoHint})`,
      value: subsidioFeriasMensal,
      muted: subsidiosJaIncluidos,
    },
    {
      label: `+ Subsídio de Natal (${modoHint})`,
      value: subsidioNatalMensal,
      muted: subsidiosJaIncluidos,
    },
    {
      label: subsidiosJaIncluidos
        ? "= Líquido mensal médio (subsídios já diluídos)"
        : "= Líquido mensal médio (com subsídios diluídos em 12 meses)",
      value: c.liquido12m,
      strong: true,
    },
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
