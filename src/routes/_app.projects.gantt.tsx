import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays } from "date-fns";
import { AppShell } from "@/components/projects/app-shell";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { GanttChart, type StageWithProject } from "@/components/projects/gantt-chart";
import { useProjectPlannerAdapter } from "@/lib/projects/use-project-planner-adapter";
import { ResourcePool } from "@/components/projects/resource-pool";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  useProjects,
  useAllStages,
  useResources,
  useDeleteProject,
  useUpdateProject,
  type ProjectStatus,
} from "@/lib/projects/use-planner";
import { allocationCost, euros } from "@/lib/projects/gantt-utils";
import { useDefaultResourceRates, effectiveCostRate } from "@/lib/projects/use-default-rates";
import {
  ArrowUpRight,
  Trash2,
  ZoomIn,
  ZoomOut,
  CircleDot,
  PauseCircle,
  Archive,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/lib/projects/types";

export const Route = createFileRoute("/_app/projects/gantt")({
  component: GlobalGanttPage,
});

const STATUS_TABS: { id: ProjectStatus; label: string; Icon: typeof CircleDot }[] = [
  { id: "active", label: "Activos", Icon: CircleDot },
  { id: "paused", label: "Em pausa", Icon: PauseCircle },
  { id: "archived", label: "Arquivados", Icon: Archive },
];

// Zoom presets in pixels-per-day. The fine +/- buttons remain available for
// in-between widths.
const ZOOM_PRESETS: { id: "day" | "week" | "month"; label: string; dayWidth: number }[] = [
  { id: "day", label: "Day", dayWidth: 40 },
  { id: "week", label: "Week", dayWidth: 16 },
  { id: "month", label: "Month", dayWidth: 6 },
];

function GlobalGanttPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: allStages } = useAllStages();
  const { data: resources } = useResources();
  const ganttAdapter = useProjectPlannerAdapter(resources ?? []);
  const { data: defaultRates } = useDefaultResourceRates();
  const del = useDeleteProject();
  const updateProject = useUpdateProject();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<ProjectStatus>("active");
  const [dayWidth, setDayWidth] = useState(28);
  const [poolCollapsed, setPoolCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const projectsWithStatus = useMemo<Project[]>(
    () => (projects ?? []).map((p) => ({ ...p, status: (p.status ?? "active") as ProjectStatus })),
    [projects],
  );

  const filteredProjects = useMemo(
    () => projectsWithStatus.filter((p) => p.status === filter),
    [projectsWithStatus, filter],
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
    const days = Math.max(60, differenceInCalendarDays(maxD, o) + 21);
    return { origin: o, totalDays: days };
  }, [stagesByProject]);

  const costsByProject = useMemo(() => {
    const m = new Map<string, { cost: number; budget: number }>();
    if (!allStages) return m;
    for (const s of allStages) {
      const cur = m.get(s.project_id) ?? { cost: 0, budget: 0 };
      cur.budget += Number(s.budget);
      for (const a of s.allocations) {
        const costRate = effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates);
        cur.cost += allocationCost({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
          hourly_rate: costRate,
        });
      }
      m.set(s.project_id, cur);
    }
    return m;
  }, [allStages, defaultRates]);

  // Detect which preset (if any) matches the current dayWidth so the toggle
  // can highlight it.
  const activePreset = ZOOM_PRESETS.find((p) => p.dayWidth === dayWidth)?.id ?? null;

  return (
    <AppShell active="projects">
      {/* Header — only shown when not in fullscreen mode */}
      {!fullscreen && (
        <div className="w-full px-6 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
              <h1 className="font-display text-4xl font-semibold tracking-tight">Global Gantt</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Todos os projectos {filter === "active" ? "activos" : filter === "paused" ? "em pausa" : "arquivados"} num
                só Gantt. Arraste recursos do painel lateral para qualquer fase, ou agarre uma alocação
                existente pelo ícone à esquerda para a mover entre fases ou projectos.
              </p>
            </div>
            <NewProjectDialog />
          </div>
        </div>
      )}

      {/* Toolbar — always visible */}
      <div className="w-full px-6 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
            {STATUS_TABS.map(({ id, label, Icon }) => {
              const count = projectsWithStatus.filter((p) => p.status === id).length;
              const active = filter === id;
              return (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <span
                    className={`ml-0.5 rounded-sm px-1 font-mono text-[10px] ${
                      active ? "bg-background/20" : "bg-muted"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Zoom presets — Day / Week / Month */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
              {ZOOM_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setDayWidth(p.dayWidth)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition ${
                    activePreset === p.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Fine zoom */}
            <div className="flex items-center gap-1 rounded-md border border-border p-1">
              <button
                onClick={() => setDayWidth((w) => Math.max(4, w - 4))}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Reduzir zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="px-1 font-mono text-[10px] text-muted-foreground">{dayWidth}px</span>
              <button
                onClick={() => setDayWidth((w) => Math.min(80, w + 4))}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Aumentar zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>

            {/* Collapse team pool */}
            <button
              onClick={() => setPoolCollapsed((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={poolCollapsed ? "Expand team pool" : "Collapse team pool"}
            >
              {poolCollapsed ? (
                <>
                  <PanelRightOpen className="h-3.5 w-3.5" /> Expand pool
                </>
              ) : (
                <>
                  <PanelRightClose className="h-3.5 w-3.5" /> Collapse pool
                </>
              )}
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => setFullscreen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {fullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" /> Exit fullscreen
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Workspace — edge-to-edge with resizable panels */}
      <div
        className="w-full px-6 pb-10 pt-4"
        style={{ height: fullscreen ? "calc(100vh - 6.5rem)" : "calc(100vh - 18rem)" }}
      >
        <ResizablePanelGroup
          orientation="horizontal"
          className="rounded-lg border border-border bg-canvas"
        >
          <ResizablePanel defaultSize={poolCollapsed ? 96 : 78} minSize={50}>
            <div className="h-full overflow-auto">
              {isLoading ? (
                <div className="p-12 text-center text-sm text-muted-foreground">A carregar…</div>
              ) : !filteredProjects.length ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="font-display text-2xl text-muted-foreground">
                      {filter === "active"
                        ? "Nenhum projecto activo"
                        : filter === "paused"
                          ? "Nada em pausa"
                          : "Nada arquivado"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {filter === "active"
                        ? "Crie um projecto para começar."
                        : "Mude o estado de um projecto para o ver aqui."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredProjects.map((p) => {
                    const stages = stagesByProject.get(p.id) ?? [];
                    const c = costsByProject.get(p.id) ?? { cost: 0, budget: 0 };
                    const over = c.cost > c.budget;
                    const status = (p.status ?? "active") as ProjectStatus;
                    return (
                      <div key={p.id} className="relative">
                        {/* Sticky-left project header — pinned during horizontal scroll */}
                        <div className="sticky left-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                            <button
                              onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: p.id } })}
                              className="group flex items-center gap-1 truncate font-display text-lg font-semibold hover:text-primary"
                            >
                              <span className="truncate">{p.name}</span>
                              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                            </button>
                            {p.client && <span className="truncate text-xs text-muted-foreground">· {p.client}</span>}
                            {stages.length > 0 && (
                              <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {stages.length} {stages.length === 1 ? "fase" : "fases"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-mono text-xs">
                                <span className={over ? "font-semibold text-destructive" : ""}>{euros(c.cost)}</span>
                                <span className="text-muted-foreground"> / {euros(c.budget)}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                              {STATUS_TABS.map(({ id, Icon, label }) => (
                                <button
                                  key={id}
                                  onClick={() =>
                                    updateProject
                                      .mutateAsync({ id: p.id, patch: { status: id } })
                                      .then(() => toast.success("Estado actualizado"))
                                      .catch((err) => toast.error((err as Error).message))
                                  }
                                  title={label}
                                  aria-label={label}
                                  className={`rounded p-1 transition ${
                                    status === id
                                      ? "bg-foreground text-background"
                                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm(`Apagar o projecto "${p.name}"?`)) return;
                                try {
                                  await del.mutateAsync(p.id);
                                  toast.success("Projecto apagado");
                                } catch (err) {
                                  toast.error((err as Error).message);
                                }
                              }}
                              className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                              aria-label="Apagar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {stages.length === 0 ? (
                          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                            Sem fases.{" "}
                            <button
                              onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: p.id } })}
                              className="underline hover:text-foreground"
                            >
                              Adicionar fases
                            </button>
                          </div>
                        ) : (
                          <GanttChart
                            projectId={p.id}
                            stages={stages}
                            origin={origin}
                            totalDays={totalDays}
                            dayWidth={dayWidth}
                            resources={resources ?? []}
                            adapter={ganttAdapter}
                            embedded
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={poolCollapsed ? 4 : 22}
            minSize={4}
            maxSize={40}
          >
            <ResourcePool resources={resources ?? []} collapsed={poolCollapsed} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </AppShell>
  );
}
