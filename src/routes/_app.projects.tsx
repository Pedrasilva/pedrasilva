import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Briefcase, Search, GanttChartSquare, Users, ListChecks, CalendarClock, ArrowLeft } from "lucide-react";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { useProjects, useAllStages, useAllAllocations } from "@/lib/projects/use-planner";
import { allocationCost, allocationHours, euros } from "@/lib/projects/gantt-utils";
import { ProjectCard } from "@/components/projects/dashboard/ProjectCard";
import { KpiStrip, type KpiStripData } from "@/components/projects/dashboard/KpiStrip";
import type { StageWithAllocations } from "@/lib/projects/types";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: stages } = useAllStages();
  const { data: allocs } = useAllAllocations();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "archived">("active");

  const stagesByProject = useMemo(() => {
    const map = new Map<string, StageWithAllocations[]>();
    for (const s of stages ?? []) {
      const arr = map.get(s.project_id) ?? [];
      arr.push(s);
      map.set(s.project_id, arr);
    }
    return map;
  }, [stages]);

  const filteredProjects = useMemo(() => {
    const list = projects ?? [];
    return list.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.client ?? "").toLowerCase().includes(q);
    });
  }, [projects, query, statusFilter]);

  const kpis = useMemo<KpiStripData>(() => {
    let wipHours = 0;
    let wipValue = 0;
    let totalPlannedHours = 0;
    let totalPlannedValue = 0;
    for (const a of allocs ?? []) {
      const hours = allocationHours({
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: Number(a.hours_per_day),
      });
      const cost = allocationCost({
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: Number(a.hours_per_day),
        hourly_rate: Number(a.resource.hourly_rate),
      });
      totalPlannedHours += hours;
      totalPlannedValue += cost;
      const status = a.stage.project.status;
      if (status === "active") {
        wipHours += hours;
        wipValue += cost;
      }
    }
    return {
      workInProgressHours: wipHours,
      workInProgressValue: wipValue,
      remainingHours: wipHours,
      workDoneTodayHours: 0,
      workDoneTodayValue: 0,
      weekHours: 0,
      billablePctThisWeek: 0,
      billableHoursThisWeek: 0,
      unapprovedHours: 0,
      unapprovedValue: 0,
      approvedUninvoicedHours: totalPlannedHours,
      approvedUninvoicedValue: totalPlannedValue,
    };
  }, [allocs]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Início
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Briefcase className="h-7 w-7" /> Projectos
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Gestão integrada de projectos, equipa, tarefas e timesheet.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <NavTile to="/projects/gantt" icon={GanttChartSquare} title="Gantt global" description="Timeline de todos os projectos" />
        <NavTile to="/projects/resources" icon={Users} title="Equipa" description="Recursos, tarifas e capacidade" />
        <NavTile to="/projects/my-tasks" icon={ListChecks} title="Minhas tarefas" description="Aceitar e fechar" />
        <NavTile to="/projects/timesheet" icon={CalendarClock} title="Timesheet" description="Lançar horas" />
      </div>

      <div className="mt-6">
        <KpiStrip data={kpis} loading={isLoading} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar por nome ou cliente…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-1">
          {(["all", "active", "paused", "archived"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2.5 py-1 text-xs capitalize transition ${
                statusFilter === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {s === "all" ? "todos" : s === "active" ? "activos" : s === "paused" ? "pausados" : "arquivados"}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {filteredProjects.length} {filteredProjects.length === 1 ? "projecto" : "projectos"}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">A carregar…</p>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center">
            <p className="font-display text-2xl text-muted-foreground">Sem projectos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query || statusFilter !== "all" ? "Nenhum projecto corresponde aos filtros." : "Cria o primeiro acima."}
            </p>
          </div>
        ) : (
          filteredProjects.map((p) => (
            <ProjectCard key={p.id} project={p} stages={stagesByProject.get(p.id) ?? []} />
          ))
        )}
      </div>
    </div>
  );
}

function NavTile({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Briefcase;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="group block rounded-lg border border-border bg-card p-4 transition hover:border-foreground/30">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

// silence unused
void euros;
