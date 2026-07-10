/**
 * RetainerMonitorPanel — simplified retainer view.
 *
 * A retainer is a fixed monthly fee subscription with a soft included-hours
 * target. We don't measure "budget vs actual €"; instead we track hours
 * used vs included and surface a rolling 3-month utilisation so busy months
 * absorbed by quieter ones read as amber (not red).
 *
 * Data model (already on `pm_stages`):
 *   - `retainer_monthly_amount`               → fixed monthly fee (€)
 *   - `retainer_capacity_hours_per_month`     → included hours per month
 *   - `retainer_months`                       → months in the series
 *   - monthly children (parent_stage_id = parent) → one row per month,
 *     `start_date` = 1st of month, `actual_hours_logged` from useStageBudgetControl
 *
 * Nothing is capped or auto-invoiced; overages surface only as warnings.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { parseISO, format as fmtDate } from "date-fns";
import { euros } from "@/lib/projects/gantt-utils";
import { cn } from "@/lib/utils";
import type { StageWithAllocations } from "@/lib/projects/types";
import type { StageBudgetControl } from "@/lib/projects/use-stage-budget-control";

interface Props {
  stages: StageWithAllocations[];
  byStage: Map<string, StageBudgetControl> | undefined;
  showFinancials: boolean;
}

type MonthStatus = "green" | "amber" | "red" | "future";

interface MonthRow {
  childId: string;
  month: string;
  monthDate: string;
  fee: number;
  includedHours: number;
  usedHours: number;
  cost: number;             // actual cost consumed this month
  sale: number;             // actual value generated this month
  variance: number;         // used - included (per month)
  rollingAvg: number;       // 3-month rolling avg of used
  rollingVariance: number;  // rollingAvg - included
  status: MonthStatus;
  isFuture: boolean;
}

interface RetainerGroup {
  parentId: string;
  parentName: string;
  color: string;
  monthlyFee: number;
  includedHours: number;
  blendedSaleRate: number;      // €/h used to derive included hours
  capacityHpm: number;          // raw retainer_capacity_hours_per_month (FTE default)
  includedHoursSource: "blended" | "unknown"; // where includedHours came from
  totalMonths: number;
  rows: MonthRow[];
  totals: {
    fee: number;
    includedHours: number;
    usedHours: number;
    cost: number;
    sale: number;
    variance: number;
    monthsOver: number;
    monthsUnder: number;
  };
}


function statusFor(
  variance: number,
  rollingVariance: number,
  isFuture: boolean,
): MonthStatus {
  if (isFuture) return "future";
  if (variance > 0 && rollingVariance > 0) return "red";
  if (variance > 0) return "amber";
  return "green";
}

export function RetainerMonitorPanel({ stages, byStage, showFinancials }: Props) {
  const { t, i18n } = useTranslation("projects");
  const todayIso = new Date().toISOString().slice(0, 10);

  const groups = useMemo<RetainerGroup[]>(() => {
    const parents = stages.filter(
      (s) => (s as { stage_kind?: string }).stage_kind === "retainer_monthly",
    );
    if (parents.length === 0) return [];
    const childrenByParent = new Map<string, StageWithAllocations[]>();
    for (const s of stages) {
      const pid = (s as { parent_stage_id?: string | null }).parent_stage_id;
      if (!pid) continue;
      const arr = childrenByParent.get(pid) ?? [];
      arr.push(s);
      childrenByParent.set(pid, arr);
    }
    return parents.map((p) => {
      const monthlyFee = Number(
        (p as { retainer_monthly_amount?: number }).retainer_monthly_amount ?? 0,
      );
      const capacityHpm = Number(
        (p as { retainer_capacity_hours_per_month?: number })
          .retainer_capacity_hours_per_month ?? 0,
      );
      const children = (childrenByParent.get(p.id) ?? []).sort((a, b) =>
        a.start_date < b.start_date ? -1 : 1,
      );

      // Build initial rows w/ used hours + real cost / sale actuals.
      const base = children.map((c) => {
        const ctrl = byStage?.get(c.id);
        const usedHours = Number(ctrl?.actual_hours_logged ?? 0);
        const cost = Number(ctrl?.actual_cost_consumed ?? 0);
        const sale = Number(ctrl?.actual_value_generated ?? 0);
        return {
          childId: c.id,
          monthDate: c.start_date,
          month: fmtDate(parseISO(c.start_date), "MMM yyyy"),
          usedHours,
          cost,
          sale,
          isFuture: c.start_date > todayIso,
        };
      });

      // Blended sale rate: derived from the resources assigned to this
      // retainer (parent-stage allocations). Each allocation carries the
      // resource's real €/h sale rate — average, weighted by planned
      // monthly hours, gives the honest "hours the fee buys" rate.
      // Falls back to actuals from logged hours (Σ sale ÷ Σ hours) if the
      // parent has no allocations, then to the FTE capacity default.
      const allocs = (p.allocations ?? []) as Array<{
        hours_per_day: number | string | null;
        start_date: string;
        end_date: string;
        resource: { hourly_rate: number | string | null };
      }>;
      let plannedHoursSum = 0;
      let plannedSaleSum = 0;
      for (const a of allocs) {
        const s = parseISO(a.start_date);
        const e = parseISO(a.end_date);
        let wd = 0;
        const d = new Date(s);
        while (d <= e) {
          const day = d.getDay();
          if (day !== 0 && day !== 6) wd++;
          d.setDate(d.getDate() + 1);
        }
        const hpd = Number(a.hours_per_day ?? 0);
        const rate = Number(a.resource?.hourly_rate ?? 0);
        const hrs = wd * hpd;
        plannedHoursSum += hrs;
        plannedSaleSum += hrs * rate;
      }
      const plannedBlendedRate =
        plannedHoursSum > 0 ? plannedSaleSum / plannedHoursSum : 0;

      const totalHoursLogged = base.reduce((s, r) => s + r.usedHours, 0);
      const totalSaleGenerated = base.reduce((s, r) => s + r.sale, 0);
      const actualBlendedRate =
        totalHoursLogged > 0 && totalSaleGenerated > 0
          ? totalSaleGenerated / totalHoursLogged
          : 0;

      const blendedSaleRate =
        plannedBlendedRate > 0 ? plannedBlendedRate : actualBlendedRate;
      // Included hours ALWAYS derive from the monthly fee ÷ blended sale
      // rate. If no rate can be established (no allocations, no logged
      // history) we surface 0 and flag it — never fall back to a generic
      // FTE capacity, which would misrepresent what the fee buys.
      const includedHoursSource: "blended" | "unknown" =
        blendedSaleRate > 0 ? "blended" : "unknown";
      const includedHours =
        blendedSaleRate > 0 && monthlyFee > 0 ? monthlyFee / blendedSaleRate : 0;
      void capacityHpm;

      const rows: MonthRow[] = base.map((r, i) => {
        // Rolling window across the previous 2 months + this one; missing
        // months (before start of series) contribute 0.
        const window = base.slice(Math.max(0, i - 2), i + 1);
        const sum = window.reduce((s, w) => s + w.usedHours, 0);
        const rollingAvg = sum / 3;
        const variance = r.usedHours - includedHours;
        const rollingVariance = rollingAvg - includedHours;
        return {
          childId: r.childId,
          month: r.month,
          monthDate: r.monthDate,
          fee: monthlyFee,
          includedHours,
          usedHours: r.usedHours,
          cost: r.cost,
          sale: r.sale,
          variance,
          rollingAvg,
          rollingVariance,
          status: statusFor(variance, rollingVariance, r.isFuture),
          isFuture: r.isFuture,
        };
      });

      const totals = rows.reduce(
        (a, r) => ({
          fee: a.fee + r.fee,
          includedHours: a.includedHours + r.includedHours,
          usedHours: a.usedHours + r.usedHours,
          cost: a.cost + r.cost,
          sale: a.sale + r.sale,
          variance: a.variance + (r.isFuture ? 0 : r.variance),
          monthsOver: a.monthsOver + (!r.isFuture && r.variance > 0 ? 1 : 0),
          monthsUnder: a.monthsUnder + (!r.isFuture && r.variance < 0 ? 1 : 0),
        }),
        { fee: 0, includedHours: 0, usedHours: 0, cost: 0, sale: 0, variance: 0, monthsOver: 0, monthsUnder: 0 },
      );

      return {
        parentId: p.id,
        parentName: p.name,
        color: p.color,
        monthlyFee,
        includedHours,
        blendedSaleRate,
        capacityHpm,
        includedHoursSource,
        totalMonths: Number(
          (p as { retainer_months?: number | null }).retainer_months ?? children.length,
        ),
        rows,
        totals,
      };
    });

  }, [stages, byStage, i18n.language, todayIso]);

  if (!showFinancials || groups.length === 0) return null;

  return (
    <section className="space-y-4">
      {groups.map((g) => {
        const cumulativeVarianceTone =
          g.totals.variance > 0
            ? "text-destructive"
            : g.totals.variance < 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground";
        return (
          <div key={g.parentId} className="rounded-lg border border-border bg-card p-4">
            <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                <h3 className="text-base font-semibold">
                  {t("detail.retainerMonitor.title", { name: g.parentName })}
                </h3>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {g.totalMonths} {t("detail.retainerMonitor.months")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t("detail.retainerMonitor.monthlyFee")}:{" "}
                  <span className="font-mono text-foreground">{euros(g.monthlyFee)}</span>
                </span>
                <span>
                  {t("detail.retainerMonitor.includedHours")}:{" "}
                  <span className="font-mono text-foreground">
                    {g.includedHours > 0 ? `${Math.round(g.includedHours)}h` : "—"}
                  </span>
                  {g.includedHoursSource === "blended" ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({t("detail.retainerMonitor.derivedFromBlended", {
                        rate: euros(g.blendedSaleRate),
                      })})
                    </span>
                  ) : (
                    <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                      ({t("detail.retainerMonitor.noRateHint")})
                    </span>
                  )}
                </span>
                <span>
                  {t("detail.retainerMonitor.usedTotal")}:{" "}
                  <span className="font-mono text-foreground">{Math.round(g.totals.usedHours)}h</span>
                </span>
                <span>
                  {t("detail.retainerMonitor.costTotal")}:{" "}
                  <span className="font-mono text-foreground">{euros(g.totals.cost)}</span>
                </span>
                <span>
                  {t("detail.retainerMonitor.saleTotal")}:{" "}
                  <span className="font-mono text-foreground">{euros(g.totals.sale)}</span>
                </span>
                <span>
                  {t("detail.retainerMonitor.cumulativeVariance")}:{" "}
                  <span className={cn("font-mono", cumulativeVarianceTone)}>
                    {g.totals.variance >= 0 ? "+" : ""}
                    {Math.round(g.totals.variance)}h
                  </span>
                </span>
                <span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    {g.totals.monthsUnder}
                  </span>{" "}
                  {t("detail.retainerMonitor.under")}{" · "}
                  <span className="font-mono text-destructive">{g.totals.monthsOver}</span>{" "}
                  {t("detail.retainerMonitor.over")}
                </span>

              </div>
            </header>

            {/* Monthly hours-vs-included chart */}
            <div className="mb-4 overflow-x-auto">
              <div className="flex items-end gap-2 pb-2" style={{ minHeight: 140 }}>
                {g.rows.map((r) => {
                  const scale = Math.max(1, g.includedHours * 1.5, ...g.rows.map((x) => x.usedHours));
                  const includedH = (g.includedHours / scale) * 120;
                  const usedH = (r.usedHours / scale) * 120;
                  const barTone =
                    r.status === "red"
                      ? "bg-destructive"
                      : r.status === "amber"
                        ? "bg-amber-500"
                        : r.status === "future"
                          ? "bg-muted-foreground/40"
                          : "bg-primary";
                  return (
                    <div key={r.childId} className="flex w-16 shrink-0 flex-col items-center gap-1">
                      <div className="relative flex h-[120px] w-full items-end justify-center gap-1">
                        <div
                          className="w-3 rounded-sm bg-muted-foreground/25"
                          style={{ height: `${includedH}px` }}
                          title={`${t("detail.retainerMonitor.includedHours")}: ${Math.round(g.includedHours)}h`}
                        />
                        <div
                          className={cn("w-3 rounded-sm", barTone)}
                          style={{ height: `${usedH}px` }}
                          title={`${t("detail.retainerMonitor.usedHoursCol")}: ${Math.round(r.usedHours)}h`}
                        />
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.month}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/25" />
                  {t("detail.retainerMonitor.includedHours")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-primary" />
                  {t("detail.retainerMonitor.statusGreen")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
                  {t("detail.retainerMonitor.statusAmber")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-destructive" />
                  {t("detail.retainerMonitor.statusRed")}
                </span>
              </div>
            </div>

            {/* Monthly table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2">{t("detail.retainerMonitor.monthCol")}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.feeCol")}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.usedHoursCol")}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.costCol")}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.saleCol")}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.varianceCol")}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.rollingCol")}</th>
                    <th className="px-2 py-2">{t("detail.retainerMonitor.statusCol")}</th>
                  </tr>

                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const varTone =
                      r.isFuture
                        ? "text-muted-foreground"
                        : r.variance > 0
                          ? "text-destructive"
                          : r.variance < 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "";
                    const pillTone =
                      r.status === "red"
                        ? "bg-destructive/15 text-destructive"
                        : r.status === "amber"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : r.status === "future"
                            ? "bg-muted text-muted-foreground"
                            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
                    const pillLabel =
                      r.status === "red"
                        ? t("detail.retainerMonitor.statusRed")
                        : r.status === "amber"
                          ? t("detail.retainerMonitor.statusAmber")
                          : r.status === "future"
                            ? t("detail.retainerMonitor.statusFuture")
                            : t("detail.retainerMonitor.statusGreen");
                    return (
                      <tr key={r.childId} className="border-b border-border/60">
                        <td className="px-2 py-2">{r.month}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{euros(r.fee)}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {Math.round(r.usedHours)}h / {Math.round(r.includedHours)}h
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {r.isFuture ? "—" : euros(r.cost)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {r.isFuture ? "—" : euros(r.sale)}
                        </td>
                        <td className={cn("px-2 py-2 text-right font-mono tabular-nums", varTone)}>
                          {r.isFuture
                            ? "—"
                            : `${r.variance >= 0 ? "+" : ""}${Math.round(r.variance)}h`}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {r.isFuture ? "—" : `${Math.round(r.rollingAvg)}h`}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              pillTone,
                            )}
                          >
                            {pillLabel}
                          </span>
                        </td>
                      </tr>
                    );

                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border text-sm font-semibold">
                    <td className="px-2 py-2">{t("detail.retainerMonitor.totalsRow")}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{euros(g.totals.fee)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {Math.round(g.totals.usedHours)}h / {Math.round(g.totals.includedHours)}h
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {euros(g.totals.cost)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {euros(g.totals.sale)}
                    </td>
                    <td className={cn("px-2 py-2 text-right font-mono tabular-nums", cumulativeVarianceTone)}>
                      {g.totals.variance >= 0 ? "+" : ""}
                      {Math.round(g.totals.variance)}h
                    </td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2" />
                  </tr>

                </tfoot>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("detail.retainerMonitor.helpText")}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
