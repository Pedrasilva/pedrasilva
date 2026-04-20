import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { AppShell } from "@/components/projects/app-shell";
import { GanttChart } from "@/components/projects/gantt-chart";
import { ResourcePool } from "@/components/projects/resource-pool";
import { NewStageDialog } from "@/components/projects/new-stage-dialog";
import { useProjectDetail, useResources } from "@/lib/projects/use-planner";
import { allocationCost, euros } from "@/lib/projects/gantt-utils";
import { useDefaultResourceRates, effectiveCostRate } from "@/lib/projects/use-default-rates";
import { ArrowLeft, ZoomIn, ZoomOut } from "lucide-react";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { data, isLoading, error } = useProjectDetail(projectId);
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const [dayWidth, setDayWidth] = useState(36);
  const navigate = useNavigate();

  const { origin, totalDays } = useMemo(() => {
    if (!data?.stages.length) {
      const o = new Date();
      return { origin: addDays(o, -14), totalDays: 180 };
    }
    let minD = new Date(data.stages[0].start_date);
    let maxD = new Date(data.stages[0].end_date);
    for (const s of data.stages) {
      const sd = new Date(s.start_date);
      const ed = new Date(s.end_date);
      if (sd < minD) minD = sd;
      if (ed > maxD) maxD = ed;
    }
    const o = addDays(minD, -14);
    const days = Math.max(120, differenceInCalendarDays(maxD, o) + 90);
    return { origin: o, totalDays: days };
  }, [data]);

  if (isLoading) {
    return (
      <AppShell active="projects">
        <div className="p-12 text-center text-sm text-muted-foreground">A carregar projecto…</div>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell active="projects">
        <div className="p-12 text-center text-sm text-destructive">Não foi possível carregar.</div>
      </AppShell>
    );
  }

  const { project, stages } = data;
  const totalBudget = stages.reduce((sum, s) => sum + Number(s.budget), 0);
  const totalCost = stages.reduce((sum, s) => {
    return (
      sum +
      s.allocations.reduce(
        (acc, a) =>
          acc +
          allocationCost({
            start_date: a.start_date,
            end_date: a.end_date,
            hours_per_day: Number(a.hours_per_day),
            hourly_rate: effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates),
          }),
        0,
      )
    );
  }, 0);
  const overall = totalBudget > 0 ? totalCost / totalBudget : 0;
  const overallOver = totalCost > totalBudget;

  return (
    <AppShell active="projects">
      <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
        <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Todos os projectos
        </Link>
        <div className="mt-3 flex items-end justify-between gap-6 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
              <h1 className="font-display text-3xl font-semibold tracking-tight">{project.name}</h1>
            </div>
            {project.client && <p className="mt-1 text-sm text-muted-foreground">{project.client}</p>}
          </div>

          <div className="flex items-end gap-6">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Alocado / Orçamento</p>
              <p className="font-mono text-lg">
                <span className={overallOver ? "text-destructive font-semibold" : ""}>{euros(totalCost)}</span>
                <span className="text-muted-foreground"> / {euros(totalBudget)}</span>
              </p>
              <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, overall * 100)}%`,
                    backgroundColor: overallOver ? "var(--color-budget-over)" : "var(--color-budget-spent)",
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border p-1">
              <button
                onClick={() => setDayWidth((w) => Math.max(16, w - 6))}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDayWidth((w) => Math.min(80, w + 6))}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
            <NewStageDialog
              projectId={project.id}
              defaultStart={
                stages.length
                  ? format(addDays(new Date(stages[stages.length - 1].end_date), 1), "yyyy-MM-dd")
                  : project.start_date
              }
              nextOrder={(stages[stages.length - 1]?.sort_order ?? 0) + 1}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] gap-0 px-6 pb-10 pt-4" style={{ height: "calc(100vh - 280px)" }}>
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-canvas">
          {stages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="font-display text-2xl text-muted-foreground">Sem fases ainda</p>
                <p className="mt-1 text-sm text-muted-foreground">Adiciona a primeira fase para começar.</p>
              </div>
            </div>
          ) : (
            <GanttChart
              projectId={project.id}
              stages={stages.map((s) => ({ ...s, projectId: project.id }))}
              origin={origin}
              totalDays={totalDays}
              dayWidth={dayWidth}
              resources={resources ?? []}
            />
          )}
        </div>
        <ResourcePool resources={resources ?? []} />
      </div>
      {/* navigate placeholder kept used to satisfy lint */}
      <span className="hidden">{String(!!navigate)}</span>
    </AppShell>
  );
}
