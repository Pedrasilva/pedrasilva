import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { ChevronRight } from "lucide-react";

type Row = {
  collab: Collaborator;
  effective: Snapshot | null;
  proposed: Snapshot | null;
};

type MetricKey = "liquido" | "alimentacao" | "ajudas" | "beneficios" | "custoVBG";

const METRICS: { key: MetricKey; label: string; help: string }[] = [
  { key: "liquido", label: "Líquido total mensal", help: "Líquido base + ajudas + alimentação" },
  { key: "alimentacao", label: "Subsídio alimentação (mensal)", help: "Diário × dias úteis / 12" },
  { key: "ajudas", label: "Ajudas de custo (mensal)", help: "Anual / 12" },
  { key: "beneficios", label: "Benefícios (anual)", help: "Carro + ticket + prémio + outros" },
  { key: "custoVBG", label: "Custo VBG (anual)", help: "Custo total para o atelier" },
];

function valueFor(snap: Snapshot | null, key: MetricKey, mealDaily: number): number | null {
  if (!snap) return null;
  const eff = { ...snap, subsidio_alimentacao_diario: mealDaily || snap.subsidio_alimentacao_diario };
  const c = computeSnapshot(eff);
  switch (key) {
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
  const [filter, setFilter] = useState("");
  const [metric, setMetric] = useState<MetricKey>("liquido");

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
      const detail = METRICS.map((m) => {
        const eff = valueFor(r.effective, m.key, eMeal);
        const prop = valueFor(r.proposed, m.key, pMeal);
        const delta = eff != null && prop != null ? prop - eff : null;
        const pct = eff && prop != null ? (prop - eff) / eff : null;
        return { key: m.key, label: m.label, eff, prop, delta, pct };
      });
      return { row: r, detail };
    });
  }, [filtered, mealRates]);

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

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comparativo Actual vs Proposto</CardTitle>
          <CardDescription>
            Diferenças por colaborador entre a ficha efectiva e a ficha proposta. Use os filtros para
            focar uma métrica ou pesquisar pelo nome.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Pesquisar colaborador</div>
              <Input
                placeholder="Nome…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-64"
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Métrica do total</div>
              <div className="flex flex-wrap gap-1.5">
                {METRICS.map((m) => (
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Proposto</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">Δ %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Sem colaboradores a apresentar.
                  </TableCell>
                </TableRow>
              )}
              {computed.map(({ row, detail }) => {
                const hasEff = !!row.effective;
                const hasProp = !!row.proposed;
                return (
                  <Fragment key={row.collab.id}>
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-medium" rowSpan={METRICS.length + 1}>
                        <Link
                          to="/hr/colaborador/$id"
                          params={{ id: row.collab.id }}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {row.collab.nome}
                          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                        </Link>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.collab.departamento}
                          {!hasEff && " · sem ficha actual"}
                          {!hasProp && " · sem ficha proposta"}
                        </div>
                      </TableCell>
                      <TableCell colSpan={5} className="text-xs text-muted-foreground">
                        {hasEff && hasProp
                          ? "Comparação completa"
                          : hasEff
                            ? "Apenas ficha actual disponível"
                            : hasProp
                              ? "Apenas ficha proposta disponível"
                              : "Sem fichas"}
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
                            {d.eff == null ? "—" : fmtEUR(d.eff)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {d.prop == null ? "—" : fmtEUR(d.prop)}
                          </TableCell>
                          <TableCell className={"text-right tabular-nums " + cls}>
                            {d.delta == null ? "—" : (d.delta > 0 ? "+" : "") + fmtEUR(d.delta)}
                          </TableCell>
                          <TableCell className={"text-right tabular-nums " + cls}>
                            {d.pct == null
                              ? "—"
                              : new Intl.NumberFormat("pt-PT", {
                                  style: "percent",
                                  maximumFractionDigits: 2,
                                }).format(d.pct)}
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
                <TableCell className="font-medium">Total ({totals.countBoth} colab.)</TableCell>
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
                  {totals.pct == null
                    ? "—"
                    : new Intl.NumberFormat("pt-PT", {
                        style: "percent",
                        maximumFractionDigits: 2,
                      }).format(totals.pct)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
