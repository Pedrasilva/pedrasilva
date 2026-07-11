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
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseISO, format as fmtDate } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { euros } from "@/lib/projects/gantt-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LogRetainerHoursDialog } from "@/components/projects/log-retainer-hours-dialog";
import type { StageWithAllocations } from "@/lib/projects/types";
import type { StageBudgetControl } from "@/lib/projects/use-stage-budget-control";

interface Props {
  stages: StageWithAllocations[];
  byStage: Map<string, StageBudgetControl> | undefined;
  showFinancials: boolean;
}

interface DirectStageAgg {
  hours: number;
  cost: number;
  sale: number;
}

/**
 * Direct pm_time_entries logged against retainer stages (task_id null,
 * pm_stage_id set). Aggregated per child stage id — merged into the
 * monthly rows so open-logged hours show up alongside allocation-based
 * ones without touching use-stage-budget-control.
 */
function useDirectRetainerEntries(childIds: string[]) {
  return useQuery({
    queryKey: ["retainer-direct-entries", [...childIds].sort().join(",")],
    enabled: childIds.length > 0,
    queryFn: async (): Promise<Map<string, DirectStageAgg>> => {
      const { data } = await supabase
        .from("pm_time_entries")
        .select("pm_stage_id, hours, billable, cost_rate_snapshot, sale_rate_snapshot")
        .in("pm_stage_id", childIds)
        .is("task_id", null);
      const m = new Map<string, DirectStageAgg>();
      for (const e of (data ?? []) as Array<{
        pm_stage_id: string;
        hours: number | string;
        billable: boolean;
        cost_rate_snapshot: number | string | null;
        sale_rate_snapshot: number | string | null;
      }>) {
        const h = Number(e.hours);
        const cr = Number(e.cost_rate_snapshot ?? 0);
        const sr = Number(e.sale_rate_snapshot ?? 0);
        const cur = m.get(e.pm_stage_id) ?? { hours: 0, cost: 0, sale: 0 };
        cur.hours += h;
        cur.cost += h * cr;
        if (e.billable) cur.sale += h * sr;
        m.set(e.pm_stage_id, cur);
      }
      return m;
    },
  });
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
  const [logOpenFor, setLogOpenFor] = useState<string | null>(null);

  const childIds = useMemo(() => {
    const parents = new Set(
      stages
        .filter((s) => (s as { stage_kind?: string }).stage_kind === "retainer_monthly")
        .map((s) => s.id),
    );
    return stages
      .filter((s) => {
        const pid = (s as { parent_stage_id?: string | null }).parent_stage_id;
        return pid && parents.has(pid);
      })
      .map((s) => s.id);
  }, [stages]);
  const { data: directByStage } = useDirectRetainerEntries(childIds);


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
      // Merge two sources: (a) actuals from `use-stage-budget-control`
      // (allocation/task-chain) and (b) direct pm_time_entries logged
      // straight against the retainer child stage (open logging, no task).
      const base = children.map((c) => {
        const ctrl = byStage?.get(c.id);
        const direct = directByStage?.get(c.id) ?? { hours: 0, cost: 0, sale: 0 };
        const usedHours = Number(ctrl?.actual_hours_logged ?? 0) + direct.hours;
        const cost = Number(ctrl?.actual_cost_consumed ?? 0) + direct.cost;
        const sale = Number(ctrl?.actual_value_generated ?? 0) + direct.sale;
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

            <RetainerByResource parentStageId={g.parentId} />
          </div>
        );
      })}
    </section>
  );
}

interface ByResourceProps {
  parentStageId: string;
}

interface ResourceRow {
  resourceId: string;
  name: string;
  hours: number;
  billableHours: number;
  cost: number;
  sale: number;
}

function RetainerByResource({ parentStageId }: ByResourceProps) {
  const { t } = useTranslation("projects");
  const { data } = useQuery({
    queryKey: ["retainer-by-resource", parentStageId],
    queryFn: async (): Promise<ResourceRow[]> => {
      // All stages that belong to this retainer: the parent itself + monthly children.
      const { data: stages } = await supabase
        .from("pm_stages")
        .select("id")
        .or(`id.eq.${parentStageId},parent_stage_id.eq.${parentStageId}`);
      const stageIds = (stages ?? []).map((s) => s.id);
      if (stageIds.length === 0) return [];

      const { data: allocs } = await supabase
        .from("pm_allocations")
        .select(
          "id, resource:pm_resources(id, name, full_name, cost_rate, hourly_rate)",
        )
        .in("stage_id", stageIds);
      const allocInfo = new Map<
        string,
        { resourceId: string; name: string; cost: number; sale: number }
      >();
      for (const a of (allocs ?? []) as Array<{
        id: string;
        resource: {
          id: string;
          name: string | null;
          full_name: string | null;
          cost_rate: number | string | null;
          hourly_rate: number | string | null;
        };
      }>) {
        allocInfo.set(a.id, {
          resourceId: a.resource.id,
          name: a.resource.full_name || a.resource.name || "—",
          cost: Number(a.resource.cost_rate ?? 0),
          sale: Number(a.resource.hourly_rate ?? 0),
        });
      }
      if (allocInfo.size === 0) return [];

      const { data: tasks } = await supabase
        .from("pm_tasks")
        .select("id, allocation_id")
        .in("allocation_id", Array.from(allocInfo.keys()));
      const taskAlloc = new Map<string, string>();
      for (const tk of (tasks ?? []) as Array<{ id: string; allocation_id: string }>) {
        taskAlloc.set(tk.id, tk.allocation_id);
      }
      if (taskAlloc.size === 0) return [];

      const { data: ents } = await supabase
        .from("pm_time_entries")
        .select("task_id, hours, billable, cost_rate_snapshot, sale_rate_snapshot")
        .eq("entry_type", "project")
        .in("task_id", Array.from(taskAlloc.keys()));

      const byRes = new Map<string, ResourceRow>();
      for (const e of (ents ?? []) as Array<{
        task_id: string;
        hours: number | string;
        billable: boolean;
        cost_rate_snapshot: number | string | null;
        sale_rate_snapshot: number | string | null;
      }>) {
        const allocId = taskAlloc.get(e.task_id);
        if (!allocId) continue;
        const info = allocInfo.get(allocId);
        if (!info) continue;
        const h = Number(e.hours);
        const costRate = e.cost_rate_snapshot != null ? Number(e.cost_rate_snapshot) : info.cost;
        const saleRate = e.sale_rate_snapshot != null ? Number(e.sale_rate_snapshot) : info.sale;
        const cur = byRes.get(info.resourceId) ?? {
          resourceId: info.resourceId,
          name: info.name,
          hours: 0,
          billableHours: 0,
          cost: 0,
          sale: 0,
        };
        cur.hours += h;
        if (e.billable) cur.billableHours += h;
        cur.cost += h * costRate;
        if (e.billable) cur.sale += h * saleRate;
        byRes.set(info.resourceId, cur);
      }
      return Array.from(byRes.values())
        .filter((r) => r.hours > 0)
        .sort((a, b) => b.sale - a.sale);
    },
  });

  if (!data || data.length === 0) return null;

  const totals = data.reduce(
    (a, r) => ({
      hours: a.hours + r.hours,
      cost: a.cost + r.cost,
      sale: a.sale + r.sale,
    }),
    { hours: 0, cost: 0, sale: 0 },
  );
  const totalMargin = totals.sale - totals.cost;
  const totalPct = totals.sale > 0 ? (totalMargin / totals.sale) * 100 : 0;

  return (
    <div className="mt-4 rounded-md border border-border/70 bg-muted/20 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("detail.retainerMonitor.byResourceTitle")}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2">{t("detail.retainerMonitor.resourceCol")}</th>
              <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.hoursCol")}</th>
              <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.costCol")}</th>
              <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.saleCol")}</th>
              <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.marginCol")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const margin = r.sale - r.cost;
              const pct = r.sale > 0 ? (margin / r.sale) * 100 : 0;
              const tone =
                margin > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : margin < 0
                    ? "text-destructive"
                    : "text-muted-foreground";
              return (
                <tr key={r.resourceId} className="border-b border-border/60">
                  <td className="px-2 py-2">{r.name}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {Math.round(r.hours)}h
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {euros(r.cost)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {euros(r.sale)}
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", tone)}>
                    {euros(margin)}{" "}
                    <span className="text-[10px]">({pct >= 0 ? "+" : ""}{Math.round(pct)}%)</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold">
              <td className="px-2 py-2">{t("detail.retainerMonitor.totalsRow")}</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                {Math.round(totals.hours)}h
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                {euros(totals.cost)}
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{euros(totals.sale)}</td>
              <td
                className={cn(
                  "px-2 py-2 text-right font-mono tabular-nums",
                  totalMargin > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : totalMargin < 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                )}
              >
                {euros(totalMargin)}{" "}
                <span className="text-[10px]">({totalPct >= 0 ? "+" : ""}{Math.round(totalPct)}%)</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
