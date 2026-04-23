import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import { SalaryDonut } from "./SalaryDonut";

export function LiquidoTab({ draft }: { draft: Snapshot }) {
  const { t } = useTranslation("hr");
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
    { label: t("snapshot.liquido.rows.baseMonthly"), value: c.base },
  ];

  if (duodecimosMensal > 0.005) {
    rows.push({
      label:
        modo === "duodecimos_100"
          ? t("snapshot.liquido.rows.duodecimos100")
          : t("snapshot.liquido.rows.duodecimos50"),
      value: duodecimosMensal,
    });
    rows.push({
      label: t("snapshot.liquido.rows.taxableBase"),
      value: c.baseMensalTributavel,
      strong: true,
    });
  }

  rows.push(
    { label: t("snapshot.liquido.rows.ssEmployeeMonthly"), value: -c.ssColaboradorMensal },
    { label: t("snapshot.liquido.rows.incomeTaxMonthly"), value: -c.irsMensal },
    { label: t("snapshot.liquido.rows.netMonthlyAvg"), value: liquidoMensalMedio, strong: true },
  );

  if (modo === "duodecimos_50") {
    rows.push(
      {
        label: t("snapshot.liquido.rows.vacationFullJune50"),
        value: subsidioPagoInteiro,
        muted: true,
      },
      {
        label: t("snapshot.liquido.rows.christmasFullNovember50"),
        value: subsidioPagoInteiro,
        muted: true,
      },
    );
  } else if (modo === "tradicional") {
    rows.push(
      {
        label: t("snapshot.liquido.rows.vacationFullJune"),
        value: subsidioPagoInteiro,
        muted: true,
      },
      {
        label: t("snapshot.liquido.rows.christmasFullNovember"),
        value: subsidioPagoInteiro,
        muted: true,
      },
    );
  }

  rows.push(
    { label: t("snapshot.liquido.rows.mealAllowanceMonthly"), value: c.alimentacaoMensal },
    { label: t("snapshot.liquido.rows.perDiemMonthly"), value: c.ajudasMensal },
    {
      label: t("snapshot.liquido.rows.totalNetMonthly"),
      value: liquidoMensalMedio + c.alimentacaoMensal + c.ajudasMensal,
      strong: true,
      accent: true,
    },
    {
      label: t("snapshot.liquido.rows.benefitsMonthly"),
      value: c.beneficiosMensal,
      muted: true,
    },
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("snapshot.liquido.title")}</CardTitle>
          <CardDescription>{t("snapshot.liquido.description")}</CardDescription>
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
              <CardTitle className="text-base">
                {isAnual
                  ? t("snapshot.liquido.composition.annualTitle")
                  : t("snapshot.liquido.composition.monthlyTitle")}
              </CardTitle>
              <CardDescription>{t("snapshot.liquido.composition.description")}</CardDescription>
            </div>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as "mensal" | "anual")}>
              <TabsList className="h-8">
                <TabsTrigger value="mensal" className="h-6 px-2 text-xs">
                  {t("snapshot.liquido.composition.monthlyToggle")}
                </TabsTrigger>
                <TabsTrigger value="anual" className="h-6 px-2 text-xs">
                  {t("snapshot.liquido.composition.annualToggle")}
                </TabsTrigger>
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
