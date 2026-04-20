import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, differenceInCalendarDays } from "date-fns";
import { Building2, ChevronDown, ChevronRight, ArrowUpRight, CalendarDays } from "lucide-react";
import { allocationCost, allocationHours, euros } from "@/lib/projects/gantt-utils";
import { formatHM } from "@/lib/projects/time-format";
import type { Project, StageWithAllocations } from "@/lib/projects/types";

interface Props {
  project: Project;
  stages: StageWithAllocations[];
  defaultExpanded?: boolean;
}

export function ProjectCard({ project, stages, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const status = project.status ?? "active";

  const stageRows = useMemo(() => {
    return stages.map((s) => {
      const cost = s.allocations.reduce(
        (acc, a) =>
          acc +
          allocationCost({
            start_date: a.start_date,
            end_date: a.end_date,
            hours_per_day: Number(a.hours_per_day),
            hourly_rate: Number(a.resource.hourly_rate),
          }),
        0,
      );
      const hours = s.allocations.reduce(
        (acc, a) =>
          acc +
          allocationHours({
            start_date: a.start_date,
            end_date: a.end_date,
            hours_per_day: Number(a.hours_per_day),
          }),
        0,
      );
      const budget = Number(s.budget);
      const usagePct = budget > 0 ? Math.round((cost / budget) * 100) : 0;
      return { stage: s, cost, hours, budget, usagePct };
    });
  }, [stages]);

  const totals = useMemo(() => {
    const cost = stageRows.reduce((a, r) => a + r.cost, 0);
    const budget = stageRows.reduce((a, r) => a + r.budget, 0);
    const hours = stageRows.reduce((a, r) => a + r.hours, 0);
    const earnedPct = budget > 0 ? Math.round((cost / budget) * 100) : 0;
    return { cost, budget, hours, earnedPct };
  }, [stageRows]);

  const schedule = useMemo(() => {
    if (!stages.length) return null;
    let min = new Date(stages[0].start_date);
    let max = new Date(stages[0].end_date);
    for (const s of stages) {
      const sd = new Date(s.start_date);
      const ed = new Date(s.end_date);
      if (sd < min) min = sd;
      if (ed > max) max = ed;
    }
    return { start: min, end: max };
  }, [stages]);

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="border-b border-border bg-muted/30 px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3 w-3" />
              <span>{project.client || "Sem cliente"}</span>
              <span className="text-muted-foreground/50">•</span>
              <span className="capitalize">{status}</span>
            </div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="group mt-1 inline-flex items-center gap-2 text-left"
            >
              {expanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
              <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground group-hover:text-primary">
                {project.name}
              </h2>
            </button>
          </div>
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Abrir <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      {expanded ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Fase</th>
                <th className="px-3 py-2 text-right font-medium">Custo / Orçamento</th>
                <th className="px-3 py-2 text-right font-medium">Horas</th>
                <th className="px-3 py-2 text-center font-medium">Início</th>
                <th className="px-5 py-2 text-center font-medium">Fim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Sem fases.
                  </td>
                </tr>
              )}
              {stageRows.map(({ stage, cost, hours, budget, usagePct }, idx) => (
                <tr key={stage.id} className="hover:bg-accent/30">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="font-medium text-foreground">
                        {idx} - {stage.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {euros(cost)} <span className="text-muted-foreground">/ {euros(budget)}</span>
                    <span className={`ml-2 ${usagePct > 100 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                      {budget > 0 ? `${usagePct}%` : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{formatHM(hours)}</td>
                  <td className="px-3 py-2.5 text-center text-xs">
                    <DatePill date={stage.start_date} />
                  </td>
                  <td className="px-5 py-2.5 text-center text-xs">
                    <DatePill date={stage.end_date} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-5 py-3 sm:grid-cols-4">
          <SummaryStat label="Earned Value" value={`${euros(totals.cost)} / ${euros(totals.budget)}`} pct={totals.earnedPct} />
          <SummaryStat label="Horas planeadas" value={formatHM(totals.hours)} />
          <SummaryStat label="Fases" value={`${stages.length}`} />
          <SummaryStat
            label="Calendário"
            value={schedule ? `${format(schedule.start, "d MMM")} → ${format(schedule.end, "d MMM")}` : "—"}
          />
        </div>
      )}
    </article>
  );
}

function SummaryStat({ label, value, pct }: { label: string; value: string; pct?: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">{value}</p>
      {typeof pct === "number" && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${pct > 100 ? "bg-destructive" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function DatePill({ date }: { date: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-foreground">
      <CalendarDays className="h-3 w-3 text-muted-foreground" />
      {format(new Date(date), "MMM d")}
    </span>
  );
}

// silence unused import in some branches
void differenceInCalendarDays;
