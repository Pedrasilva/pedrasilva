import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import {
  useProjects,
  useAllStages,
  useResources,
  useDeleteProject,
  useUpdateProject,
  useProjectDetail,
  type ProjectStatus,
} from "@/lib/projects/use-planner";
import { allocationCost, euros } from "@/lib/projects/gantt-utils";
import {
  ArrowLeft,
  Trash2,
  ZoomIn,
  ZoomOut,
  CircleDot,
  PauseCircle,
  Archive,
  ArrowUpRight,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewStageDialog } from "@/components/projects/new-stage-dialog";
import { GanttChart, type StageWithProject } from "@/components/projects/gantt-chart";
import { ResourcePool } from "@/components/projects/resource-pool";
import type { Project } from "@/lib/projects/types";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsHub,
});

const STATUS_TABS: { id: ProjectStatus; label: string; Icon: typeof CircleDot }[] = [
  { id: "active", label: "Activos", Icon: CircleDot },
  { id: "paused", label: "Em pausa", Icon: PauseCircle },
  { id: "archived", label: "Arquivados", Icon: Archive },
];

function ProjectsHub() {
  const { data: projects, isLoading } = useProjects();
  const { data: allStages } = useAllStages();
  const { data: resources } = useResources();
  const del = useDeleteProject();
  const updateProject = useUpdateProject();

  const [filter, setFilter] = useState<ProjectStatus>("active");
  const [dayWidth, setDayWidth] = useState(28);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

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

  // If a project is open, render its detail view
  if (openProjectId) {
    return (
      <ProjectDetailView
        projectId={openProjectId}
        onBack={() => setOpenProjectId(null)}
        resources={resources ?? []}
      />
    );
  }

  return (
    <div className="-mx-4 -my-6 sm:-mx-6">
      <div className="mx-auto w-full max-w-[1800px] px-6 pt-6">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Início
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
            <h1 className="font-display text-4xl font-semibold tracking-tight flex items-center gap-2">
              <Briefcase className="h-7 w-7" /> Projectos
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Todos os projectos {filter === "active" ? "activos" : filter === "paused" ? "em pausa" : "arquivados"} num
              só Gantt. Arraste recursos do painel lateral para qualquer fase, ou agarre uma alocação existente pelo
              ícone à esquerda para a mover entre fases ou projectos.
            </p>
          </div>
          <NewProjectDialog />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
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

          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            <button
              onClick={() => setDayWidth((w) => Math.max(14, w - 4))}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Reduzir zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDayWidth((w) => Math.min(72, w + 4))}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Aumentar zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1800px] gap-0 px-6 pb-10 pt-4" style={{ height: "calc(100vh - 280px)" }}>
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-canvas">
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
                    ? "Cria um projecto para começar."
                    : "Muda o estado de um projecto para o ver aqui."}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredProjects.map((p) => {
                const stages = stagesByProject.get(p.id) ?? [];
                const c = costsByProject.get(p.id) ?? { cost: 0, budget: 0 };
                const over = c.cost > c.budget;
                return (
                  <ProjectSwimLane
                    key={p.id}
                    project={p}
                    stages={stages}
                    origin={origin}
                    totalDays={totalDays}
                    dayWidth={dayWidth}
                    resources={resources ?? []}
                    cost={c.cost}
                    budget={c.budget}
                    over={over}
                    onOpen={() => setOpenProjectId(p.id)}
                    onChangeStatus={(status) =>
                      updateProject
                        .mutateAsync({ id: p.id, patch: { status } })
                        .then(() =>
                          toast.success(
                            status === "active"
                              ? "Projecto activado"
                              : status === "paused"
                                ? "Projecto pausado"
                                : "Projecto arquivado",
                          ),
                        )
                        .catch((err) => toast.error((err as Error).message))
                    }
                    onDelete={async () => {
                      if (!confirm(`Apagar o projecto "${p.name}"? Remove todas as fases e alocações.`)) return;
                      try {
                        await del.mutateAsync(p.id);
                        toast.success("Projecto apagado");
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                  />
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

interface SwimLaneProps {
  project: Project;
  stages: StageWithProject[];
  origin: Date;
  totalDays: number;
  dayWidth: number;
  resources: NonNullable<ReturnType<typeof useResources>["data"]>;
  cost: number;
  budget: number;
  over: boolean;
  onChangeStatus: (s: ProjectStatus) => void;
  onDelete: () => void;
  onOpen: () => void;
}

function ProjectSwimLane({
  project,
  stages,
  origin,
  totalDays,
  dayWidth,
  resources,
  cost,
  budget,
  over,
  onChangeStatus,
  onDelete,
  onOpen,
}: SwimLaneProps) {
  const status = (project.status ?? "active") as ProjectStatus;
  return (
    <div className="relative">
      <div className="sticky left-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
          <button
            onClick={onOpen}
            className="group flex items-center gap-1 truncate font-display text-lg font-semibold hover:text-primary"
          >
            <span className="truncate">{project.name}</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
          </button>
          {project.client && <span className="truncate text-xs text-muted-foreground">· {project.client}</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-xs">
              <span className={over ? "font-semibold text-destructive" : ""}>{euros(cost)}</span>
              <span className="text-muted-foreground"> / {euros(budget)}</span>
            </p>
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {STATUS_TABS.map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => onChangeStatus(id)}
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
            onClick={onDelete}
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
          <button onClick={onOpen} className="underline hover:text-foreground">
            Adicionar fases
          </button>
        </div>
      ) : (
        <GanttChart
          projectId={project.id}
          stages={stages}
          origin={origin}
          totalDays={totalDays}
          dayWidth={dayWidth}
          resources={resources}
          embedded
        />
      )}
    </div>
  );
}

function ProjectDetailView({
  projectId,
  onBack,
  resources,
}: {
  projectId: string;
  onBack: () => void;
  resources: NonNullable<ReturnType<typeof useResources>["data"]>;
}) {
  const { data, isLoading } = useProjectDetail(projectId);
  const [dayWidth, setDayWidth] = useState(36);

  const { origin, totalDays } = useMemo(() => {
    if (!data?.stages.length) return { origin: addDays(new Date(), -14), totalDays: 180 };
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

  if (isLoading || !data) {
    return <div className="p-12 text-center text-sm text-muted-foreground">A carregar projecto…</div>;
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
            hourly_rate: Number(a.resource.hourly_rate),
          }),
        0,
      )
    );
  }, 0);
  const overall = totalBudget > 0 ? totalCost / totalBudget : 0;
  const overallOver = totalCost > totalBudget;

  return (
    <div className="-mx-4 -my-6 sm:-mx-6">
      <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Todos os projectos
        </button>
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

      <div className="mx-auto flex w-full max-w-[1600px] gap-0 px-6 pb-10 pt-4" style={{ height: "calc(100vh - 240px)" }}>
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
              resources={resources}
            />
          )}
        </div>
        <ResourcePool resources={resources} />
      </div>
    </div>
  );
}
