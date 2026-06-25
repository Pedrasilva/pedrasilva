/**
 * Budget Control panel — project + per-stage actuals, remaining budget,
 * estimated available hours. Hidden behind `canSeeFinancials` by the caller.
 *
 * Implements PART 1 of the Gantt control view:
 *   • timesheets consume budget (actual_cost_consumed)
 *   • remaining_budget = original_budget − actual_cost_consumed
 *   • estimated_available_hours = remaining / avg team cost rate
 *   • projected_over_under = remaining − planned_future_cost
 */
import { useTranslation } from "react-i18next";
import { euros } from "@/lib/projects/gantt-utils";
import { cn } from "@/lib/utils";
import type {
  ProjectBudgetControl,
  StageBudgetControl,
} from "@/lib/projects/use-stage-budget-control";

interface Stage {
  id: string;
  name: string;
  color: string;
}

interface Props {
  project: ProjectBudgetControl;
  byStage: Map<string, StageBudgetControl>;
  stages: Stage[];
  showFinancials: boolean;
}

function MetricTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

export function BudgetControlPanel({ project, byStage, stages, showFinancials }: Props) {
  const { t } = useTranslation("projects");
  if (!showFinancials) return null;

  const overUnderTone =
    project.projected_over_under < 0 ? "danger" : project.projected_over_under > 0 ? "ok" : "muted";

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3">
        <h3 className="text-base font-semibold">
          {t("detail.budgetControl.title")}
        </h3>
        <p className="text-[12px] text-muted-foreground">
          {t("detail.budgetControl.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricTile
          label={t("detail.budgetControl.actualUsed")}
          value={euros(project.actual_cost_consumed)}
          sub={t("detail.budgetControl.actualUsedSub", {
            hours: Math.round(project.actual_hours_logged),
          })}
        />
        <MetricTile
          label={t("detail.budgetControl.remainingBudget")}
          value={euros(project.remaining_budget)}
          sub={t("detail.budgetControl.remainingBudgetSub")}
          tone={project.remaining_budget < 0 ? "danger" : undefined}
        />
        <MetricTile
          label={t("detail.budgetControl.avgRate")}
          value={project.has_team_rate ? `${euros(project.average_team_hourly_rate)}/h` : "—"}
          sub={t("detail.budgetControl.avgRateSub")}
          tone={project.has_team_rate ? undefined : "muted"}
        />
        <MetricTile
          label={t("detail.budgetControl.estimatedHours")}
          value={
            project.estimated_available_hours == null
              ? "—"
              : `${Math.max(0, Math.round(project.estimated_available_hours))}h`
          }
          sub={
            project.estimated_available_hours == null
              ? t("detail.budgetControl.noTeamRate")
              : t("detail.budgetControl.estimatedHoursSub")
          }
          tone={project.estimated_available_hours == null ? "muted" : undefined}
        />
        <MetricTile
          label={t("detail.budgetControl.plannedAhead")}
          value={euros(project.planned_future_cost)}
          sub={t("detail.budgetControl.plannedAheadSub", {
            hours: Math.round(project.planned_future_hours),
          })}
        />
        <MetricTile
          label={t("detail.budgetControl.projectedOverUnder")}
          value={euros(project.projected_over_under)}
          sub={t("detail.budgetControl.projectedOverUnderSub")}
          tone={overUnderTone}
        />
      </div>

      {stages.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("detail.budgetControl.perStage")}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2">{t("detail.budgetControl.stageCol")}</th>
                <th className="px-2 py-2 text-right">{t("detail.budgetControl.actualCol")}</th>
                <th className="px-2 py-2 text-right">{t("detail.budgetControl.remainingCol")}</th>
                <th className="px-2 py-2 text-right">{t("detail.budgetControl.rateCol")}</th>
                <th className="px-2 py-2 text-right">{t("detail.budgetControl.estHoursCol")}</th>
                <th className="px-2 py-2 text-right">{t("detail.budgetControl.futureCol")}</th>
                <th className="px-2 py-2 text-right">{t("detail.budgetControl.overUnderCol")}</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const c = byStage.get(s.id);
                if (!c) return null;
                const ouTone =
                  c.projected_over_under < 0
                    ? "text-destructive"
                    : c.projected_over_under > 0
                      ? ""
                      : "text-muted-foreground";
                return (
                  <tr key={s.id} className="border-b border-border/60">
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate">{s.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {euros(c.actual_cost_consumed)}
                      <div className="text-[10px] text-muted-foreground">
                        {Math.round(c.actual_hours_logged)}h
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 text-right font-mono tabular-nums",
                        c.remaining_budget < 0 && "text-destructive",
                      )}
                    >
                      {euros(c.remaining_budget)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {c.has_team_rate ? `${euros(c.average_team_hourly_rate)}/h` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {c.estimated_available_hours == null
                        ? "—"
                        : `${Math.max(0, Math.round(c.estimated_available_hours))}h`}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {euros(c.planned_future_cost)}
                      <div className="text-[10px] text-muted-foreground">
                        {Math.round(c.planned_future_hours)}h
                      </div>
                    </td>
                    <td className={cn("px-2 py-2 text-right font-mono tabular-nums", ouTone)}>
                      {euros(c.projected_over_under)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
