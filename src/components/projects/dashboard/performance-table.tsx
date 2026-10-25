import { useTranslation } from "react-i18next";
import i18n from "@/i18n/index";
import { plannedAllocationFigures } from "@/lib/projects/financial-calculation";
import { effectiveRates } from "@/lib/projects/use-default-rates";
import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Project, Resource, StageWithAllocations } from "@/lib/projects/types";
import { allocationCost, allocationHours, euros } from "@/lib/projects/gantt-utils";
import {
  useDefaultResourceRates,
  effectiveCostRate,
  effectiveSaleRate,
} from "@/lib/projects/use-default-rates";
import { cn } from "@/lib/utils";

type Metric = "Value" | "Budget (hrs)" | "Number of Projects";

interface Props {
  projects: Project[];
  stages: StageWithAllocations[];
  resources: Resource[];
  loading?: boolean;
}

export function PerformanceTable({ projects, stages, resources, loading }: Props) {
  useTranslation();
  const [metric, setMetric] = useState<Metric>("Budget (hrs)");
  const { data: defaultRates } = useDefaultResourceRates();

  const rows = useMemo(() => {
    const byResource = new Map<
      string,
      {
        name: string;
        active: number;
        value: number;
        hours: number;
        onBudgetGood: number;
        onBudgetWarn: number;
        onBudgetBad: number;
        onTimeGood: number;
        onTimeWarn: number;
        onTimeBad: number;
      }
    >();

    const today = new Date();
    const stagesByProject = new Map<string, StageWithAllocations[]>();
    for (const s of stages) {
      const arr = stagesByProject.get(s.project_id) ?? [];
      arr.push(s);
      stagesByProject.set(s.project_id, arr);
    }

    for (const project of projects) {
      const ps = stagesByProject.get(project.id) ?? [];
      const projectBudget = ps.reduce((acc, s) => acc + Number(s.budget), 0);
      const projectCost = ps.reduce(
        (acc, s) =>
          acc +
          s.allocations.reduce(
            (a, al) =>
              a +
              plannedAllocationFigures(al,effectiveRates(al.resource,defaultRates)).cost,

            0,
          ),
        0,
      );
      const budgetRatio = projectBudget > 0 ? projectCost / projectBudget : 0;
      const budgetTone: "good" | "warn" | "bad" =
        budgetRatio > 1 ? "bad" : budgetRatio > 0.85 ? "warn" : "good";

      const lastEnd = ps.reduce<Date | null>((acc, s) => {
        const ed = parseISO(s.end_date);
        return !acc || ed > acc ? ed : acc;
      }, null);
      const overdueDays = lastEnd ? differenceInCalendarDays(today, lastEnd) : -999;
      const timeTone: "good" | "warn" | "bad" =
        overdueDays > 0 ? "bad" : overdueDays > -7 ? "warn" : "good";

      const resourcesOnProject = new Map<string, number>();
      for (const s of ps) {
        for (const a of s.allocations) {
          const h = allocationHours({
            start_date: a.start_date,
            end_date: a.end_date,
            hours_per_day: Number(a.hours_per_day),
          });
          resourcesOnProject.set(
            a.resource_id,
            (resourcesOnProject.get(a.resource_id) ?? 0) + h,
          );
        }
      }

      for (const [resourceId, hours] of resourcesOnProject) {
        const res = resources.find((r) => r.id === resourceId);
        if (!res) continue;
        const cur = byResource.get(resourceId) ?? {
          name: res.name,
          active: 0,
          value: 0,
          hours: 0,
          onBudgetGood: 0,
          onBudgetWarn: 0,
          onBudgetBad: 0,
          onTimeGood: 0,
          onTimeWarn: 0,
          onTimeBad: 0,
        };
        cur.active += 1;
        cur.hours += hours;
        cur.value += hours * effectiveSaleRate(res.hourly_rate, res.id, defaultRates, !!res.hourly_rate_is_override);
        if (budgetTone === "good") cur.onBudgetGood += 1;
        else if (budgetTone === "warn") cur.onBudgetWarn += 1;
        else cur.onBudgetBad += 1;
        if (timeTone === "good") cur.onTimeGood += 1;
        else if (timeTone === "warn") cur.onTimeWarn += 1;
        else cur.onTimeBad += 1;
        byResource.set(resourceId, cur);
      }
    }

    return Array.from(byResource.values()).sort((a, b) => b.value - a.value);
  }, [projects, stages, resources, defaultRates]);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
             {i18n.t("projects:performanceTable.ui.performance")} </h2>
          <span className="text-[11px] text-muted-foreground"> {i18n.t("projects:performanceTable.ui.analyzeByResource")} </span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-1">
          {(["Value", "Budget (hrs)", "Number of Projects"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium",
                metric === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left font-medium"> {i18n.t("projects:performanceTable.ui.staff")} </th>
              <th className="px-3 py-2 text-center font-medium"> {i18n.t("projects:performanceTable.ui.activeCount")} </th>
              <th className="px-3 py-2 text-right font-medium"> {i18n.t("glossary:financial.value")} </th>
              <th className="px-3 py-2 text-left font-medium"> {i18n.t("projects:performanceTable.ui.onBudget")} </th>
              <th className="px-5 py-2 text-left font-medium"> {i18n.t("projects:performanceTable.ui.onTime")} </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">
                   {i18n.t("common:loading")} </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">
                   {i18n.t("projects:performanceTable.ui.noAllocatedResources")} </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.name} className="hover:bg-accent/30">
                <td className="px-5 py-2.5 text-sm text-foreground">{r.name}</td>
                <td className="px-3 py-2.5 text-center font-mono text-xs text-muted-foreground">
                  {r.active}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-foreground">
                  {metric === "Number of Projects"
                    ? r.active
                    : metric === "Budget (hrs)"
                      ? i18n.t("projects:performanceTable.ui.hoursValue", { value1: Math.round(r.hours) })
                      : euros(r.value)}
                </td>
                <td className="px-3 py-2.5">
                  <SegmentBar good={r.onBudgetGood} warn={r.onBudgetWarn} bad={r.onBudgetBad} />
                </td>
                <td className="px-5 py-2.5">
                  <SegmentBar good={r.onTimeGood} warn={r.onTimeWarn} bad={r.onTimeBad} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SegmentBar({ good, warn, bad }: { good: number; warn: number; bad: number }) {
  useTranslation();
  const total = good + warn + bad;
  if (total === 0) {
    return <div className="h-2.5 w-full rounded-full bg-muted" />;
  }
  const g = (good / total) * 100;
  const w = (warn / total) * 100;
  const b = (bad / total) * 100;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {g > 0 && <div className="bg-emerald-500" style={{ width: `${g}%` }} />}
      {w > 0 && <div className="bg-amber-500" style={{ width: `${w}%` }} />}
      {b > 0 && <div className="bg-destructive" style={{ width: `${b}%` }} />}
    </div>
  );
}
