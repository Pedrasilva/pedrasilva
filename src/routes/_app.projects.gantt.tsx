import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays } from "date-fns";
import { ArrowLeft, ZoomIn, ZoomOut, CircleDot, PauseCircle, Archive, ArrowUpRight } from "lucide-react";
import { useProjects, useAllStages, useResources, type ProjectStatus } from "@/lib/projects/use-planner";
import { allocationCost, euros } from "@/lib/projects/gantt-utils";
import { GanttChart, type StageWithProject } from "@/components/projects/GanttChart";
import { ResourcePool } from "@/components/projects/ResourcePool";

export const Route = createFileRoute("/_app/projects/gantt")({
  component: GlobalGanttPage,
});

const STATUS_TABS: { id: ProjectStatus; label: string; Icon: typeof CircleDot }[] = [
  { id: "active", label: "Activos", Icon: CircleDot },
  { id: "paused", label: "Em pausa", Icon: PauseCircle },
  { id: "archived", label: "Arquivados", Icon: Archive },
];

function GlobalGanttPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: allStages } = useAllStages();
  const { data: resources } = useResources();
  const [filter, setFilter] = useState<ProjectStatus>("active");
  const [dayWidth, setDayWidth] = useState(28);

  const filteredProjects = useMemo(
    () => (projects ?? []).filter((p) => (p.status ?? "active") === filter),
    [projects, filter],
  );

  const stagesByProject = useMemo(() => {
    const map = new Map<string, StageWithProject[]>();
    if (!allStages) return map;
    const idSet = new Set(filteredProjects.map((p) => p.id));
    for (const s of allStages) {
      if (!idSet.has(s.project_id)) continue;
      const arr = map.get(s.project_id) ?? [];
      arr.push({ ...s, projectId: s.project_id });
      map.set(s.project_id, arr);
    }
    return map;
  }, [allStages, filteredProjects]);

  const { origin, totalDays } = useMemo(() => {
    const all: StageWithProject[] = [];
    stagesByProject.forEach((arr) => all.push(...arr));
    if (!all.length) return { origin: addDays(new Date(), -7), totalDays: 90 };
    let minD = new Date(all[0].start_date);
    let maxD = new Date(all[0].end_date);
    for (const s of all) {
      const sd = new Date(s.start_date);
      const ed = new Date(s.end_date);
      if (sd < minD) minD = sd;
      if (ed > maxD) maxD = ed;
    }
    const o = addDays(minD, -7);
    return { origin: o, totalDays: Math.max(60, differenceInCalendarDays(maxD, o) + 21) };
  }, [stagesByProject]);

  const costsByProject = useMemo(() => {
    const m = new Map<string, { cost: number; budget: number }>();
    for (const s of allStages ?? []) {
      const cur = m.get(s.project_id) ?? { cost: 0, budget: 0 };
      cur.budget += Number(s.budget);
      for (const a of s.allocations) {
        cur.cost += allocationCost({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
          hourly_rate: Number(a.resource.hourly_rate),
        });
      }
      m.set(s.project_id, cur);
    }
    return m;
  }, [allStages]);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-6 pt-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Projectos
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Gantt global</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
            {STATUS_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition ${
                  filter === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            <button onClick={() => setDayWidth((w) => Math.max(14, w - 4))} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><ZoomOut className="h-4 w-4" /></button>
            <button onClick={() => setDayWidth((w) => Math.min(72, w + 4))} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><ZoomIn className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-0" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">A carregar…</div>
          ) : !filteredProjects.length ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <p className="font-display text-2xl text-muted-foreground">Nada para mostrar</p>
                <p className="mt-1 text-sm text-muted-foreground">Cria um projecto ou muda os filtros.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProjects.map((p) => {
                const stages = stagesByProject.get(p.id) ?? [];
                const c = costsByProject.get(p.id) ?? { cost: 0, budget: 0 };
                const over = c.cost > c.budget;
                return (
                  <div key={p.id}>
                    <div className="sticky left-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: p.id }}
                          className="group flex items-center gap-1 truncate font-display text-lg font-semibold hover:text-primary"
                        >
                          <span className="truncate">{p.name}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                        </Link>
                        {p.client && <span className="truncate text-xs text-muted-foreground">· {p.client}</span>}
                      </div>
                      <p className="font-mono text-xs">
                        <span className={over ? "font-semibold text-destructive" : ""}>{euros(c.cost)}</span>
                        <span className="text-muted-foreground"> / {euros(c.budget)}</span>
                      </p>
                    </div>
                    {stages.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-muted-foreground">Sem fases.</div>
                    ) : (
                      <GanttChart
                        projectId={p.id}
                        stages={stages}
                        origin={origin}
                        totalDays={totalDays}
                        dayWidth={dayWidth}
                        resources={resources ?? []}
                        embedded
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <ResourcePool resources={resources ?? []} />
      </div>
    </div>
  );
}
