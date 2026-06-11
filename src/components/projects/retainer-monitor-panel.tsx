/**
 * RetainerMonitorPanel — monthly budget vs actuals for retainer stages in a
 * bootstrapped project.
 *
 * Reads parent retainer stages (stage_kind = 'retainer_monthly') and their
 * monthly child stages (parent_stage_id = parent.id). For each child it
 * compares the locked monthly fee (child.budget) to actual cost consumed
 * (from useStageBudgetControl). Renders a bar chart per month + a totals
 * table.
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

interface MonthRow {
  childId: string;
  month: string; // formatted "Jul 2026"
  monthDate: string;
  budget: number;
  cost: number;
  hours: number;
  delta: number; // budget - cost
}

interface RetainerGroup {
  parentId: string;
  parentName: string;
  color: string;
  monthlyFee: number;
  totalMonths: number;
  rows: MonthRow[];
  totals: { budget: number; cost: number; hours: number; delta: number };
}

export function RetainerMonitorPanel({ stages, byStage, showFinancials }: Props) {
  const { t, i18n } = useTranslation("projects");

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
      const children = (childrenByParent.get(p.id) ?? []).sort((a, b) =>
        a.start_date < b.start_date ? -1 : 1,
      );
      const rows: MonthRow[] = children.map((c) => {
        const ctrl = byStage?.get(c.id);
        const budget = Number(c.budget ?? 0);
        const cost = Number(ctrl?.actual_cost_consumed ?? 0);
        const hours = Number(ctrl?.actual_hours_logged ?? 0);
        return {
          childId: c.id,
          month: fmtDate(parseISO(c.start_date), "MMM yyyy"),
          monthDate: c.start_date,
          budget,
          cost,
          hours,
          delta: budget - cost,
        };
      });
      const totals = rows.reduce(
        (a, r) => ({
          budget: a.budget + r.budget,
          cost: a.cost + r.cost,
          hours: a.hours + r.hours,
          delta: a.delta + r.delta,
        }),
        { budget: 0, cost: 0, hours: 0, delta: 0 },
      );
      return {
        parentId: p.id,
        parentName: p.name,
        color: p.color,
        monthlyFee: Number((p as { retainer_monthly_amount?: number }).retainer_monthly_amount ?? 0),
        totalMonths: Number((p as { retainer_months?: number | null }).retainer_months ?? children.length),
        rows,
        totals,
      };
    });
  }, [stages, byStage, i18n.language]);

  if (!showFinancials || groups.length === 0) return null;

  return (
    <section className="space-y-4">
      {groups.map((g) => {
        const maxBar = Math.max(
          1,
          ...g.rows.map((r) => Math.max(r.budget, r.cost)),
        );
        return (
          <div key={g.parentId} className="rounded-lg border border-border bg-card p-4">
            <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                <h3 className="font-display text-base font-semibold">
                  {t("detail.retainerMonitor.title", { name: g.parentName, defaultValue: `Retainer monitor — ${g.parentName}` })}
                </h3>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {g.totalMonths} {t("detail.retainerMonitor.months", { defaultValue: "months" })}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t("detail.retainerMonitor.monthlyFee", { defaultValue: "Monthly fee" })}:{" "}
                  <span className="font-mono text-foreground">{euros(g.monthlyFee)}</span>
                </span>
                <span>
                  {t("detail.retainerMonitor.budgetTotal", { defaultValue: "Budget total" })}:{" "}
                  <span className="font-mono text-foreground">{euros(g.totals.budget)}</span>
                </span>
                <span>
                  {t("detail.retainerMonitor.actualsTotal", { defaultValue: "Actuals total" })}:{" "}
                  <span className={cn("font-mono", g.totals.cost > g.totals.budget ? "text-destructive" : "text-foreground")}>
                    {euros(g.totals.cost)}
                  </span>
                </span>
                <span>
                  {t("detail.retainerMonitor.deltaTotal", { defaultValue: "Δ" })}:{" "}
                  <span className={cn("font-mono", g.totals.delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                    {euros(g.totals.delta)}
                  </span>
                </span>
              </div>
            </header>

            {/* Monthly chart */}
            <div className="mb-4 overflow-x-auto">
              <div className="flex items-end gap-2 pb-2" style={{ minHeight: 140 }}>
                {g.rows.map((r) => {
                  const budgetH = (r.budget / maxBar) * 120;
                  const costH = (r.cost / maxBar) * 120;
                  const over = r.cost > r.budget;
                  return (
                    <div key={r.childId} className="flex w-16 shrink-0 flex-col items-center gap-1">
                      <div className="relative flex h-[120px] w-full items-end justify-center gap-1">
                        <div
                          className="w-3 rounded-sm bg-muted-foreground/30"
                          style={{ height: `${budgetH}px` }}
                          title={`${t("detail.retainerMonitor.budget", { defaultValue: "Budget" })}: ${euros(r.budget)}`}
                        />
                        <div
                          className={cn("w-3 rounded-sm", over ? "bg-destructive" : "bg-primary")}
                          style={{ height: `${costH}px` }}
                          title={`${t("detail.retainerMonitor.actual", { defaultValue: "Actual" })}: ${euros(r.cost)}`}
                        />
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.month}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/30" />
                  {t("detail.retainerMonitor.budget", { defaultValue: "Budget" })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-primary" />
                  {t("detail.retainerMonitor.actual", { defaultValue: "Actual" })}
                </span>
              </div>
            </div>

            {/* Monthly table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2">{t("detail.retainerMonitor.monthCol", { defaultValue: "Month" })}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.budgetCol", { defaultValue: "Budget" })}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.actualCol", { defaultValue: "Actual" })}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.hoursCol", { defaultValue: "Hours" })}</th>
                    <th className="px-2 py-2 text-right">{t("detail.retainerMonitor.deltaCol", { defaultValue: "Δ" })}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.childId} className="border-b border-border/60">
                      <td className="px-2 py-2">{r.month}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{euros(r.budget)}</td>
                      <td className={cn("px-2 py-2 text-right font-mono tabular-nums", r.cost > r.budget && "text-destructive")}>
                        {euros(r.cost)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{Math.round(r.hours)}h</td>
                      <td className={cn("px-2 py-2 text-right font-mono tabular-nums", r.delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                        {euros(r.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border text-sm font-semibold">
                    <td className="px-2 py-2">{t("detail.retainerMonitor.totalsRow", { defaultValue: "Total" })}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{euros(g.totals.budget)}</td>
                    <td className={cn("px-2 py-2 text-right font-mono tabular-nums", g.totals.cost > g.totals.budget && "text-destructive")}>
                      {euros(g.totals.cost)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{Math.round(g.totals.hours)}h</td>
                    <td className={cn("px-2 py-2 text-right font-mono tabular-nums", g.totals.delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                      {euros(g.totals.delta)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
