import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, fmtEUR, type Collaborator, type Snapshot } from "@/lib/salary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ChevronRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Row = {
  collab: Collaborator;
  effective: Snapshot | null;
  proposed: Snapshot | null;
};

type MetricKey = "valorBase" | "liquido" | "alimentacao" | "ajudas" | "beneficios" | "custoVBG";

const METRIC_KEYS: MetricKey[] = [
  "valorBase",
  "liquido",
  "alimentacao",
  "ajudas",
  "beneficios",
  "custoVBG",
];

function valueFor(snap: Snapshot | null, key: MetricKey, mealDaily: number): number | null {
  if (!snap) return null;
  const eff = { ...snap, subsidio_alimentacao_diario: mealDaily || snap.subsidio_alimentacao_diario };
  const c = computeSnapshot(eff);
  switch (key) {
    case "valorBase":
      return snap.valor_base ?? 0;
    case "liquido":
      return c.liquidoTotalMensal;
    case "alimentacao":
      return c.alimentacaoMensal;
    case "ajudas":
      return c.ajudasMensal;
    case "beneficios":
      return c.beneficiosAnual;
    case "custoVBG":
      return c.custoVBG;
  }
}

export function ResumoComparativoTab({ rows }: { rows: Row[] }) {
  const { t, i18n } = useTranslation("hr");
  const [filter, setFilter] = useState("");
  const [metric, setMetric] = useState<MetricKey>("liquido");

  const dash = t("hr:collaborator.subline.empty");

  const metrics = useMemo(
    () =>
      METRIC_KEYS.map((key) => ({
        key,
        label: t(`hr:resumoComparativo.metrics.${key}.label`),
        help: t(`hr:resumoComparativo.metrics.${key}.help`),
      })),
    [t],
  );

  const { data: mealRates = [] } = useQuery({
    queryKey: ["meal-allowance-rates-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_allowance_rates")
        .select("ano, valor_cartao")
        .order("ano", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { ano: number; valor_cartao: number }[];
    },
  });

  const mealDailyFor = (s: Snapshot | null): number => {
    if (!s) return 0;
    // Override manual tem prioridade sobre a tabela anual
    if (s.subsidio_alimentacao_manual) return s.subsidio_alimentacao_diario_manual ?? 0;
    if (mealRates.length === 0) return s.subsidio_alimentacao_diario ?? 0;
    const y = Number((s.reference_date ?? "").slice(0, 4));
    const refYear = Number.isFinite(y) && y > 1900 ? y : new Date().getFullYear();
    const exact = mealRates.find((r) => r.ano === refYear);
    if (exact) return Number(exact.valor_cartao);
    const earlier = mealRates.filter((r) => r.ano <= refYear).sort((a, b) => b.ano - a.ano)[0];
    if (earlier) return Number(earlier.valor_cartao);
    return Number(mealRates[0].valor_cartao);
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.collab.nome.toLowerCase().includes(q));
  }, [rows, filter]);

  const computed = useMemo(() => {
    return filtered.map((r) => {
      const eMeal = mealDailyFor(r.effective);
      const pMeal = mealDailyFor(r.proposed);
      const detail = metrics.map((m) => {
        const eff = valueFor(r.effective, m.key, eMeal);
        const prop = valueFor(r.proposed, m.key, pMeal);
        const delta = eff != null && prop != null ? prop - eff : null;
        const pct = eff && prop != null ? (prop - eff) / eff : null;
        return { key: m.key, label: m.label, eff, prop, delta, pct };
      });
      return { row: r, detail };
    });
  }, [filtered, mealRates, metrics]);

  // Comparação global Bruto Anual (todos os colaboradores filtrados).
  // Quando não há ficha proposta, assume-se o valor actual (sem alteração).
  const brutoGlobal = useMemo(() => {
    let actual = 0;
    let proposto = 0;
    let comProposta = 0;
    for (const r of filtered) {
      const eff = r.effective ? computeSnapshot(r.effective).brutoAnual : 0;
      const prop = r.proposed ? computeSnapshot(r.proposed).brutoAnual : eff;
      actual += eff;
      proposto += prop;
      if (r.proposed) comProposta += 1;
    }
    const delta = proposto - actual;
    const pct = actual > 0 ? delta / actual : null;
    return { actual, proposto, delta, pct, comProposta, total: filtered.length };
  }, [filtered]);

  // Comparação global do Custo Total — mensal (anual/12) e anual.
  // Usa o mesmo critério do card anual: bruto anual completo (base × meses
  // + SS patronal + subsídio alimentação + ajudas custo + passe + benefícios).
  const valorBaseGlobal = useMemo(() => {
    let actualAnual = 0;
    let propostoAnual = 0;
    let comProposta = 0;
    for (const r of filtered) {
      const eff = r.effective ? computeSnapshot(r.effective).brutoAnual : 0;
      const prop = r.proposed ? computeSnapshot(r.proposed).brutoAnual : eff;
      actualAnual += eff;
      propostoAnual += prop;
      if (r.proposed) comProposta += 1;
    }
    const actualMensal = actualAnual / 12;
    const propostoMensal = propostoAnual / 12;
    const deltaMensal = propostoMensal - actualMensal;
    const deltaAnual = propostoAnual - actualAnual;
    const pct = actualMensal > 0 ? deltaMensal / actualMensal : null;
    return {
      actualMensal,
      propostoMensal,
      actualAnual,
      propostoAnual,
      deltaMensal,
      deltaAnual,
      pct,
      comProposta,
      total: filtered.length,
    };
  }, [filtered]);

  const totals = useMemo(() => {
    let eff = 0;
    let prop = 0;
    let countBoth = 0;
    for (const c of computed) {
      const m = c.detail.find((d) => d.key === metric);
      if (!m) continue;
      if (m.eff != null && m.prop != null) {
        eff += m.eff;
        prop += m.prop;
        countBoth += 1;
      }
    }
    const delta = prop - eff;
    const pct = eff > 0 ? delta / eff : null;
    return { eff, prop, delta, pct, countBoth };
  }, [computed, metric]);

  const metricLabel = metrics.find((m) => m.key === metric)?.label ?? "";

  const pctFormatter = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr:resumoComparativo.title")}</CardTitle>
          <CardDescription>{t("hr:resumoComparativo.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.filters.searchLabel")}
              </div>
              <Input
                placeholder={t("hr:resumoComparativo.filters.searchPlaceholder")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-64"
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.filters.metricLabel")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {metrics.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetric(m.key)}
                    className={
                      "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                      (metric === m.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-muted")
                    }
                    title={m.help}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr:resumoComparativo.valorBaseGlobal.title")}</CardTitle>
          <CardDescription>
            {t("hr:resumoComparativo.valorBaseGlobal.description", {
              withProposal: valorBaseGlobal.comProposta,
              total: valorBaseGlobal.total,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.valorBaseGlobal.currentMonthly")}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtEUR(valorBaseGlobal.actualMensal)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("hr:resumoComparativo.valorBaseGlobal.annualPrefix", {
                  value: fmtEUR(valorBaseGlobal.actualAnual),
                })}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.valorBaseGlobal.proposedMonthly")}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtEUR(valorBaseGlobal.propostoMensal)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("hr:resumoComparativo.valorBaseGlobal.annualPrefix", {
                  value: fmtEUR(valorBaseGlobal.propostoAnual),
                })}
              </div>
            </div>
            <div
              className={
                "rounded-lg border p-3 " +
                (valorBaseGlobal.deltaMensal > 0
                  ? "border-negative/40 bg-negative/5"
                  : valorBaseGlobal.deltaMensal < 0
                    ? "border-positive/40 bg-positive/5"
                    : "bg-muted/30")
              }
            >
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.valorBaseGlobal.monthlyIncrease")}
              </div>
              <div
                className={
                  "mt-1 text-2xl font-semibold tabular-nums " +
                  (valorBaseGlobal.deltaMensal > 0
                    ? "text-negative"
                    : valorBaseGlobal.deltaMensal < 0
                      ? "text-positive"
                      : "")
                }
              >
                {(valorBaseGlobal.deltaMensal > 0 ? "+" : "") + fmtEUR(valorBaseGlobal.deltaMensal)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("hr:resumoComparativo.valorBaseGlobal.annualX14Prefix", {
                  value:
                    (valorBaseGlobal.deltaAnual > 0 ? "+" : "") + fmtEUR(valorBaseGlobal.deltaAnual),
                })}
                {valorBaseGlobal.pct != null && (
                  <>
                    {" · "}
                    {(valorBaseGlobal.deltaMensal > 0 ? "+" : "") +
                      pctFormatter.format(valorBaseGlobal.pct)}
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {t("hr:resumoComparativo.brutoGlobal.title")}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="info">
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm text-xs leading-relaxed">
                  {t("hr:resumoComparativo.brutoGlobal.infoTooltip")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>
            {t("hr:resumoComparativo.brutoGlobal.description", {
              withProposal: brutoGlobal.comProposta,
              total: brutoGlobal.total,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.brutoGlobal.currentAnnual")}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtEUR(brutoGlobal.actual)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.brutoGlobal.proposedAnnual")}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtEUR(brutoGlobal.proposto)}
              </div>
            </div>
            <div
              className={
                "rounded-lg border p-3 " +
                (brutoGlobal.delta > 0
                  ? "border-negative/40 bg-negative/5"
                  : brutoGlobal.delta < 0
                    ? "border-positive/40 bg-positive/5"
                    : "bg-muted/30")
              }
            >
              <div className="text-xs text-muted-foreground">
                {t("hr:resumoComparativo.brutoGlobal.additionalAnnual")}
              </div>
              <div
                className={
                  "mt-1 text-2xl font-semibold tabular-nums " +
                  (brutoGlobal.delta > 0
                    ? "text-negative"
                    : brutoGlobal.delta < 0
                      ? "text-positive"
                      : "")
                }
              >
                {(brutoGlobal.delta > 0 ? "+" : "") + fmtEUR(brutoGlobal.delta)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {brutoGlobal.pct == null
                  ? dash
                  : (brutoGlobal.delta > 0 ? "+" : "") +
                    pctFormatter.format(brutoGlobal.pct) +
                    " " +
                    t("hr:resumoComparativo.brutoGlobal.vsCurrent")}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t("hr:resumoComparativo.brutoGlobal.monthlyEquivalent", {
              value: (brutoGlobal.delta > 0 ? "+" : "") + fmtEUR(brutoGlobal.delta / 12),
            })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("hr:resumoComparativo.table.collaborator")}</TableHead>
                <TableHead>{t("hr:resumoComparativo.table.metric")}</TableHead>
                <TableHead className="text-right">{t("hr:resumoComparativo.table.current")}</TableHead>
                <TableHead className="text-right">{t("hr:resumoComparativo.table.proposed")}</TableHead>
                <TableHead className="text-right">{t("hr:resumoComparativo.table.delta")}</TableHead>
                <TableHead className="text-right">{t("hr:resumoComparativo.table.deltaPct")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {t("hr:resumoComparativo.table.empty")}
                  </TableCell>
                </TableRow>
              )}
              {computed.map(({ row, detail }) => {
                const hasEff = !!row.effective;
                const hasProp = !!row.proposed;
                return (
                  <Fragment key={row.collab.id}>
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-medium" rowSpan={metrics.length + 1}>
                        <Link
                          to="/hr/colaborador/$id"
                          params={{ id: row.collab.id }}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {row.collab.nome}
                          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                        </Link>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t(`hr:enums.department.${row.collab.departamento}`)}
                          {!hasEff && t("hr:resumoComparativo.table.noEffective")}
                          {!hasProp && t("hr:resumoComparativo.table.noProposed")}
                        </div>
                      </TableCell>
                      <TableCell colSpan={5} className="text-xs text-muted-foreground">
                        {hasEff && hasProp
                          ? t("hr:resumoComparativo.table.fullComparison")
                          : hasEff
                            ? t("hr:resumoComparativo.table.onlyEffective")
                            : hasProp
                              ? t("hr:resumoComparativo.table.onlyProposed")
                              : t("hr:resumoComparativo.table.noSnapshots")}
                      </TableCell>
                    </TableRow>
                    {detail.map((d) => {
                      const cls =
                        d.delta == null
                          ? "text-muted-foreground"
                          : d.delta > 0
                            ? "text-positive"
                            : d.delta < 0
                              ? "text-negative"
                              : "";
                      return (
                        <TableRow key={row.collab.id + d.key}>
                          <TableCell className="text-sm">{d.label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {d.eff == null ? dash : fmtEUR(d.eff)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {d.prop == null ? dash : fmtEUR(d.prop)}
                          </TableCell>
                          <TableCell className={"text-right tabular-nums " + cls}>
                            {d.delta == null ? dash : (d.delta > 0 ? "+" : "") + fmtEUR(d.delta)}
                          </TableCell>
                          <TableCell className={"text-right tabular-nums " + cls}>
                            {d.pct == null ? dash : pctFormatter.format(d.pct)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">
                  {t("hr:resumoComparativo.table.totalLabel", { count: totals.countBoth })}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{metricLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtEUR(totals.eff)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtEUR(totals.prop)}</TableCell>
                <TableCell
                  className={
                    "text-right tabular-nums " +
                    (totals.delta > 0
                      ? "text-positive"
                      : totals.delta < 0
                        ? "text-negative"
                        : "text-muted-foreground")
                  }
                >
                  {(totals.delta > 0 ? "+" : "") + fmtEUR(totals.delta)}
                </TableCell>
                <TableCell
                  className={
                    "text-right tabular-nums " +
                    (totals.delta > 0
                      ? "text-positive"
                      : totals.delta < 0
                        ? "text-negative"
                        : "text-muted-foreground")
                  }
                >
                  {totals.pct == null ? dash : pctFormatter.format(totals.pct)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
