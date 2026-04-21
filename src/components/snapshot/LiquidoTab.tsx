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

  // Estrutura por regime:
  // - tradicional (14m): base mensal tributada = valor_base; subsídios pagos
  //   por inteiro em Jun/Nov (também tributados nesses meses).
  // - duodecimos_50 (13m): base mensal tributada = valor_base + 50% subsídios/12;
  //   metade restante de cada subsídio paga por inteiro em Jun/Nov.
  // - duodecimos_100 (12m): base mensal tributada = valor_base + 100% subsídios/12;
  //   nada pago por inteiro.
  // A SS e o IRS já são calculados sobre a base mensal tributável (c.baseMensalTributavel).
  const modo = draft.subsidios_modo ?? "tradicional";

  // Parte dos subsídios diluída na base mensal (= baseMensalTributavel − valor_base)
  const duodecimosMensal = c.baseMensalTributavel - c.base;

  // Valor líquido de UM subsídio inteiro pago em Jun/Nov (mesmo cálculo da base mensal)
  const subsidioInteiroLiquido = c.base * (1 - draft.ss_colaborador_pct - draft.irs_pct);

  // Subsídio pago por inteiro (Junho/Novembro), valor por subsídio
  const subsidioPagoInteiro =
    modo === "duodecimos_100"
      ? 0
      : modo === "duodecimos_50"
        ? subsidioInteiroLiquido / 2
        : subsidioInteiroLiquido;

  const liquidoMensalMedio = c.liquido14m;

  const rows: Array<{ label: string; value: number; raw?: string; strong?: boolean; accent?: boolean; muted?: boolean }> = [
    { label: "Valor base mensal", value: c.base },
  ];

  if (duodecimosMensal > 0.005) {
    rows.push({
      label:
        modo === "duodecimos_100"
          ? "+ Duodécimos (subsídios férias + Natal diluídos em 12 meses)"
          : "+ Duodécimos (50% dos subsídios diluídos em 12 meses)",
      value: duodecimosMensal,
    });
    rows.push({
      label: "= Base mensal tributável",
      value: c.baseMensalTributavel,
      strong: true,
    });
  }

  rows.push(
    { label: "− SS Colaborador (mensal)", value: -c.ssColaboradorMensal },
    { label: "− IRS (mensal)", value: -c.irsMensal },
    { label: "= Líquido mensal médio", value: liquidoMensalMedio, strong: true },
  );

  if (modo === "duodecimos_50") {
    rows.push(
      {
        label: "+ Subsídio de férias (50% pago por inteiro em Junho)",
        value: subsidioPagoInteiro,
        muted: true,
      },
      {
        label: "+ Subsídio de Natal (50% pago por inteiro em Novembro)",
        value: subsidioPagoInteiro,
        muted: true,
      },
    );
  } else if (modo === "tradicional") {
    rows.push(
      {
        label: "+ Subsídio de férias (pago por inteiro em Junho)",
        value: subsidioPagoInteiro,
        muted: true,
      },
      {
        label: "+ Subsídio de Natal (pago por inteiro em Novembro)",
        value: subsidioPagoInteiro,
        muted: true,
      },
    );
  }

  rows.push(
    { label: "+ Subsídio alimentação mensal", value: c.alimentacaoMensal },
    { label: "+ Ajudas de custo mensais", value: c.ajudasMensal },
    {
      label: "= Líquido total mensal",
      value: liquidoMensalMedio + c.alimentacaoMensal + c.ajudasMensal,
      strong: true,
      accent: true,
    },
    {
      label: "+ Benefícios (média mensal: carro + ticket + prémio + outros)",
      value: c.beneficiosMensal,
      muted: true,
    },
  );
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
