import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/projects/app-shell";
import { GanttChart } from "@/components/projects/gantt-chart";
import { ResourcePool } from "@/components/projects/resource-pool";
import { NewStageDialog } from "@/components/projects/new-stage-dialog";
import {
  useProjectDetail,
  useResources,
  useUpdateProject,
} from "@/lib/projects/use-planner";
import {
  allocationCost,
  allocationHours,
  euros,
} from "@/lib/projects/gantt-utils";
import {
  useDefaultResourceRates,
  effectiveCostRate,
} from "@/lib/projects/use-default-rates";
import { useProjectInvoices } from "@/lib/projects/use-invoices";
import { useProjectActivities } from "@/lib/projects/use-activities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Pause,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Receipt,
  Users as UsersIcon,
  Activity as ActivityIcon,
  ListChecks,
  Mail,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  ChevronDown,
  Search,
  ArrowUpDown,
  Plus,
  MoreVertical,
  Pencil,
  UserPlus,
} from "lucide-react";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetail,
});

type TabKey = "overview" | "schedule" | "insights" | "stream";

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { data, isLoading, error } = useProjectDetail(projectId);
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const { data: invoices } = useProjectInvoices(projectId);
  const { data: activities } = useProjectActivities(projectId);
  const updateProject = useUpdateProject();

  const [tab, setTab] = useState<TabKey>("overview");
  const [dayWidth, setDayWidth] = useState(36);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [poolOpen, setPoolOpen] = useState(true);

  // Real time entries for this project (per stage via allocation→stage)
  const { data: timeRows } = useQuery({
    queryKey: ["pm-project-time", projectId],
    enabled: !!projectId && !!data,
    queryFn: async () => {
      if (!data) return [] as { stage_id: string; hours: number }[];
      const allocIds = data.stages.flatMap((s) =>
        s.allocations.map((a) => a.id),
      );
      if (allocIds.length === 0) return [];
      // task ids belong to allocations
      const { data: tasks } = await supabase
        .from("pm_tasks")
        .select("id, allocation_id")
        .in("allocation_id", allocIds);
      const taskToAlloc = new Map<string, string>();
      const allocToStage = new Map<string, string>();
      for (const s of data.stages)
        for (const a of s.allocations) allocToStage.set(a.id, s.id);
      for (const t of tasks ?? []) taskToAlloc.set(t.id, t.allocation_id);
      const taskIds = (tasks ?? []).map((t) => t.id);
      if (taskIds.length === 0) return [];
      const { data: entries } = await supabase
        .from("pm_time_entries")
        .select("task_id, hours")
        .in("task_id", taskIds);
      const byStage = new Map<string, number>();
      for (const e of entries ?? []) {
        const allocId = taskToAlloc.get(e.task_id);
        const stageId = allocId ? allocToStage.get(allocId) : undefined;
        if (!stageId) continue;
        byStage.set(stageId, (byStage.get(stageId) ?? 0) + Number(e.hours));
      }
      return Array.from(byStage, ([stage_id, hours]) => ({ stage_id, hours }));
    },
  });

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
        <div className="p-12 text-center text-sm text-muted-foreground">
          A carregar projecto…
        </div>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell active="projects">
        <div className="p-12 text-center text-sm text-destructive">
          Não foi possível carregar.
        </div>
      </AppShell>
    );
  }

  const { project, stages } = data;

  // ---- Aggregations -----------------------------------------------------
  const totalBudget = stages.reduce((sum, s) => sum + Number(s.budget), 0);

  const stageCost = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return 0;
    return s.allocations.reduce(
      (acc, a) =>
        acc +
        allocationCost({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
          hourly_rate: effectiveCostRate(
            a.resource.cost_rate,
            a.resource.id,
            defaultRates,
          ),
        }),
      0,
    );
  };
  const stagePlannedHours = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return 0;
    return s.allocations.reduce(
      (acc, a) =>
        acc +
        allocationHours({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
        }),
      0,
    );
  };
  const stageLoggedHours = (stageId: string) =>
    timeRows?.find((r) => r.stage_id === stageId)?.hours ?? 0;

  const totalCost = stages.reduce((acc, s) => acc + stageCost(s.id), 0);
  const totalLoggedHours = stages.reduce(
    (acc, s) => acc + stageLoggedHours(s.id),
    0,
  );
  const totalPlannedHours = stages.reduce(
    (acc, s) => acc + stagePlannedHours(s.id),
    0,
  );
  const overall = totalBudget > 0 ? totalCost / totalBudget : 0;
  const overallOver = totalCost > totalBudget;

  // Earned value = invoiced € (excluding cancelled)
  const invoicedTotal = (invoices ?? [])
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + Number(i.total ?? 0), 0);
  const evPct = totalBudget > 0 ? invoicedTotal / totalBudget : 0;

  // Schedule range
  const scheduleStart = stages.length
    ? stages.reduce(
        (m, s) => (parseISO(s.start_date) < m ? parseISO(s.start_date) : m),
        parseISO(stages[0].start_date),
      )
    : parseISO(project.start_date);
  const scheduleEnd = stages.length
    ? stages.reduce(
        (m, s) => (parseISO(s.end_date) > m ? parseISO(s.end_date) : m),
        parseISO(stages[0].end_date),
      )
    : addDays(parseISO(project.start_date), 30);
  const today = new Date();
  const totalSpan = Math.max(
    1,
    differenceInCalendarDays(scheduleEnd, scheduleStart),
  );
  const elapsedDays = Math.max(
    0,
    Math.min(totalSpan, differenceInCalendarDays(today, scheduleStart)),
  );
  const remainingDays = Math.max(
    0,
    differenceInCalendarDays(scheduleEnd, today),
  );
  const overdueDays = today > scheduleEnd
    ? differenceInCalendarDays(today, scheduleEnd)
    : 0;

  // Team derived from unique allocated resources
  const team = Array.from(
    new Map(
      stages
        .flatMap((s) => s.allocations)
        .map((a) => [a.resource.id, a.resource]),
    ).values(),
  );

  // ---- Header status workflow ------------------------------------------
  const setStatus = (status: "active" | "paused" | "archived") => {
    updateProject.mutate({ id: project.id, patch: { status } });
  };

  return (
    <AppShell active="projects">
      <div className="mx-auto w-full max-w-[1800px] px-4 pt-6 sm:px-6 2xl:px-10">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Todos os projectos
          </Link>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={sidebarOpen ? "Esconder painel lateral" : "Mostrar painel lateral"}
          >
            {sidebarOpen ? (
              <>
                <PanelLeftClose className="h-3.5 w-3.5" /> Esconder painel
              </>
            ) : (
              <>
                <PanelLeftOpen className="h-3.5 w-3.5" /> Mostrar painel
              </>
            )}
          </button>
        </div>

        {/* Header ------------------------------------------------------- */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {project.client ?? "Cliente"} · Projecto
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="font-display text-3xl font-semibold tracking-tight truncate">
                {project.name}
              </h1>
              <StatusBadge status={project.status} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusToggle current={project.status} onChange={setStatus} />
            <NewStageDialog
              projectId={project.id}
              defaultStart={
                stages.length
                  ? format(
                      addDays(new Date(stages[stages.length - 1].end_date), 1),
                      "yyyy-MM-dd",
                    )
                  : project.start_date
              }
              nextOrder={(stages[stages.length - 1]?.sort_order ?? 0) + 1}
            />
          </div>
        </div>

        {/* Body 2-col layout ------------------------------------------- */}
        <div
          className={cn(
            "mt-6 grid gap-6",
            sidebarOpen ? "lg:grid-cols-[300px_minmax(0,1fr)]" : "lg:grid-cols-1",
          )}
        >
          {/* Sidebar ---------------------------------------------------- */}
          <aside className={cn("space-y-6", !sidebarOpen && "hidden")}>
            <SidebarSection title="Detalhes">
              <DetailRow label="Cliente" value={project.client ?? "—"} />
              <DetailRow
                label="Início"
                value={format(parseISO(project.start_date), "d MMM yyyy", {
                  locale: pt,
                })}
              />
              <DetailRow
                label="Equipa"
                value={team.length > 0 ? `${team.length} pessoas` : "—"}
              />
            </SidebarSection>

            {team.length > 0 && (
              <SidebarSection title="Team">
                <div className="flex flex-wrap gap-2">
                  {team.map((r) => (
                    <Link
                      key={r.id}
                      to="/projects/resources/$resourceId"
                      params={{ resourceId: r.id }}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="truncate max-w-[120px]">{r.name}</span>
                    </Link>
                  ))}
                </div>
              </SidebarSection>
            )}

            <SidebarSection title="Earned Value">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm">
                  {euros(invoicedTotal)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {euros(totalBudget)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(evPct * 100)}%
                </span>
              </div>
              <Meter value={Math.min(1, evPct)} tone="info" className="mt-2" />
            </SidebarSection>

            <SidebarSection title="Progress">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm">
                  <span className={overallOver ? "text-destructive font-semibold" : ""}>
                    {euros(totalCost)}
                  </span>
                  <span className="text-muted-foreground"> / {euros(totalBudget)}</span>
                </span>
                <span
                  className={cn(
                    "text-xs",
                    overallOver ? "text-destructive font-medium" : "text-muted-foreground",
                  )}
                >
                  {Math.round(overall * 100)}%
                </span>
              </div>
              <Meter
                value={Math.min(1, overall)}
                tone={overallOver ? "danger" : "ok"}
                className="mt-2"
              />
              <div className="mt-2 text-[11px] text-muted-foreground">
                {totalLoggedHours.toFixed(1)}h registadas /{" "}
                {totalPlannedHours.toFixed(0)}h planeadas
              </div>
            </SidebarSection>

            <SidebarSection title="Schedule">
              <div className="flex items-center justify-between text-xs">
                <span>{format(scheduleStart, "d MMM", { locale: pt })}</span>
                <span>{format(scheduleEnd, "d MMM", { locale: pt })}</span>
              </div>
              <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 bg-primary"
                  style={{
                    width: `${Math.min(100, (elapsedDays / totalSpan) * 100)}%`,
                  }}
                />
                {overdueDays > 0 && (
                  <div className="absolute inset-y-0 right-0 w-[3px] bg-destructive" />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{elapsedDays} dias decorridos</span>
                {overdueDays > 0 ? (
                  <span className="font-medium text-destructive">
                    {overdueDays} em atraso
                  </span>
                ) : (
                  <span>{remainingDays} dias restantes</span>
                )}
              </div>
            </SidebarSection>

            <SidebarSection title="Datas importantes">
              <DateChip
                label="Criado"
                date={parseISO(project.created_at)}
              />
              <DateChip
                label="Início planeado"
                date={parseISO(project.start_date)}
              />
              <DateChip
                label="1ª fase"
                date={scheduleStart}
              />
              <DateChip label="Fim previsto" date={scheduleEnd} highlight />
            </SidebarSection>

            <SidebarSection title="Project email">
              <a
                href={`mailto:project+${project.id.slice(0, 8)}@pedra-silva-architects.lovable.app`}
                className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <Mail className="h-3 w-3" />
                project+{project.id.slice(0, 8)}@pedrasilva.app
              </a>
            </SidebarSection>
          </aside>

          {/* Main ------------------------------------------------------ */}
          <section>
            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
              <TabBtn icon={ListChecks} label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
              <TabBtn icon={Calendar} label="Schedule" active={tab === "schedule"} onClick={() => setTab("schedule")} />
              <TabBtn icon={TrendingUp} label="Insights" active={tab === "insights"} onClick={() => setTab("insights")} />
              <TabBtn icon={ActivityIcon} label="Stream" active={tab === "stream"} onClick={() => setTab("stream")} />
            </div>

            {tab === "overview" && (
              <div className="mt-4 rounded-lg border border-border bg-card">
                <MilestonesTable
                  stages={stages}
                  invoiced={invoicedTotal}
                  totalBudget={totalBudget}
                  stageCost={stageCost}
                  stageLoggedHours={stageLoggedHours}
                  stagePlannedHours={stagePlannedHours}
                  defaultRates={defaultRates}
                />
              </div>
            )}

            {tab === "schedule" && (
              <div className="mt-4">
                <div className="mb-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setPoolOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={poolOpen ? "Esconder team pool" : "Mostrar team pool"}
                  >
                    {poolOpen ? (
                      <>
                        <PanelRightClose className="h-3.5 w-3.5" /> Esconder team pool
                      </>
                    ) : (
                      <>
                        <PanelRightOpen className="h-3.5 w-3.5" /> Mostrar team pool
                      </>
                    )}
                  </button>
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
                </div>
                <div className="flex h-[calc(100vh-320px)] min-h-[520px] gap-0">
                  <div className="flex-1 overflow-auto rounded-lg border border-border bg-canvas">
                    {stages.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="text-center">
                          <p className="font-display text-2xl text-muted-foreground">
                            Sem fases ainda
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Adiciona a primeira fase para começar.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <GanttChart
                        projectId={project.id}
                        stages={stages.map((s) => ({
                          ...s,
                          projectId: project.id,
                        }))}
                        origin={origin}
                        totalDays={totalDays}
                        dayWidth={dayWidth}
                        resources={resources ?? []}
                      />
                    )}
                  </div>
                  {poolOpen && <ResourcePool resources={resources ?? []} />}
                </div>
              </div>
            )}

            {tab === "insights" && (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  icon={Receipt}
                  label="Faturado"
                  value={euros(invoicedTotal)}
                  hint={`${invoices?.filter((i) => i.status !== "cancelled").length ?? 0} faturas`}
                />
                <KpiCard
                  icon={Clock}
                  label="Horas registadas"
                  value={`${totalLoggedHours.toFixed(1)}h`}
                  hint={`de ${totalPlannedHours.toFixed(0)}h planeadas`}
                />
                <KpiCard
                  icon={UsersIcon}
                  label="Equipa"
                  value={`${team.length}`}
                  hint="alocados"
                />
                <KpiCard
                  icon={TrendingUp}
                  label="Margem (custo / orç.)"
                  value={`${Math.round(overall * 100)}%`}
                  hint={overallOver ? "acima do orçamento" : "dentro do orçamento"}
                  tone={overallOver ? "danger" : "ok"}
                />
              </div>
            )}

            {tab === "stream" && (
              <div className="mt-4 space-y-3">
                {(activities ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    Sem actividade registada neste projecto.
                  </div>
                ) : (
                  (activities ?? []).map((a) => (
                    <article
                      key={a.id}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <header className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          {a.author && (
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: a.author.color }}
                            />
                          )}
                          <span className="font-medium text-foreground">
                            {a.author?.name ?? "Sistema"}
                          </span>
                          {a.stage && <span>· {a.stage.name}</span>}
                        </div>
                        <time>
                          {format(parseISO(a.created_at), "d MMM, HH:mm", {
                            locale: pt,
                          })}
                        </time>
                      </header>
                      <h3 className="mt-1 text-sm font-semibold">{a.title}</h3>
                      {a.body && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">
                          {a.body}
                        </p>
                      )}
                      {a.logged_hours > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> {a.logged_hours}h
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

// ===== Subcomponents =====================================================

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "paused"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  const label = status === "active" ? "Activo" : status === "paused" ? "Em pausa" : "Arquivado";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider", tone)}>
      {label}
    </span>
  );
}

function StatusToggle({
  current,
  onChange,
}: {
  current: string;
  onChange: (s: "active" | "paused" | "archived") => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      <Button
        size="sm"
        variant={current === "active" ? "default" : "ghost"}
        className="h-7 gap-1.5 text-xs"
        onClick={() => onChange("active")}
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Activar
      </Button>
      <Button
        size="sm"
        variant={current === "paused" ? "default" : "ghost"}
        className="h-7 gap-1.5 text-xs"
        onClick={() => onChange("paused")}
      >
        <Pause className="h-3.5 w-3.5" /> Pausar
      </Button>
      <Button
        size="sm"
        variant={current === "archived" ? "default" : "ghost"}
        className="h-7 gap-1.5 text-xs"
        onClick={() => onChange("archived")}
      >
        <XCircle className="h-3.5 w-3.5" /> Arquivar
      </Button>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border pb-5 last:border-b-0">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right font-medium truncate">{value}</span>
    </div>
  );
}

function Meter({
  value,
  tone,
  className,
}: {
  value: number;
  tone: "ok" | "danger" | "info";
  className?: string;
}) {
  const colorVar =
    tone === "danger"
      ? "var(--color-budget-over)"
      : tone === "info"
        ? "var(--primary)"
        : "var(--color-budget-spent)";
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, backgroundColor: colorVar }}
      />
    </div>
  );
}

function DateChip({
  label,
  date,
  highlight,
}: {
  label: string;
  date: Date;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className={cn(
          "flex h-10 w-10 flex-col items-center justify-center rounded-md border text-center leading-none",
          highlight ? "border-primary bg-primary/5" : "border-border bg-background",
        )}
      >
        <span className="text-[11px] font-semibold">
          {format(date, "dd")}
        </span>
        <span className="text-[9px] uppercase text-muted-foreground">
          {format(date, "MMM", { locale: pt })}
        </span>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
          {label}
        </div>
        <div className="font-medium">
          {format(date, "d MMMM yyyy", { locale: pt })}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div
        className={cn(
          "mt-2 font-display text-2xl font-semibold",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function MilestonesTable({
  stages,
  stageCost,
  stageLoggedHours,
  stagePlannedHours,
  defaultRates,
}: {
  stages: ReturnType<typeof useProjectDetail>["data"] extends infer T
    ? T extends { stages: infer S }
      ? S
      : never
    : never;
  invoiced: number;
  totalBudget: number;
  stageCost: (id: string) => number;
  stageLoggedHours: (id: string) => number;
  stagePlannedHours: (id: string) => number;
  defaultRates: ReturnType<typeof useDefaultResourceRates>["data"];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(stages?.map((s) => s.id) ?? []),
  );
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "empty">("all");
  const [search, setSearch] = useState("");

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allExpanded = stages.every((s) => expanded.has(s.id));
  const toggleAll = () => {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(stages.map((s) => s.id)));
  };

  const filtered = stages.filter((s) => {
    if (statusFilter === "active" && s.allocations.length === 0) return false;
    if (statusFilter === "empty" && s.allocations.length > 0) return false;
    if (search) {
      const q = search.toLowerCase();
      const inName = s.name.toLowerCase().includes(q);
      const inAllocs = s.allocations.some((a) =>
        a.resource.name.toLowerCase().includes(q),
      );
      if (!inName && !inAllocs) return false;
    }
    return true;
  });

  if (!stages || stages.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Adiciona uma fase para começar.
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={allExpanded ? "Colapsar tudo" : "Expandir tudo"}
            title={allExpanded ? "Colapsar tudo" : "Expandir tudo"}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            <span className="text-foreground/80">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "empty")}
              className="bg-transparent text-xs font-medium text-foreground outline-none"
            >
              <option value="all">Todos</option>
              <option value="active">Activas</option>
              <option value="empty">Sem alocação</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent">
            <Pencil className="h-3.5 w-3.5" /> Edit Plan
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent">
            <Plus className="h-3.5 w-3.5" /> Add Task
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Milestones &amp; Tasks</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Earned Value</th>
              <th className="px-4 py-2.5 font-semibold">Usage / Budget</th>
              <th className="px-4 py-2.5 font-semibold">Scheduled start</th>
              <th className="px-4 py-2.5 font-semibold">Scheduled due</th>
              <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const cost = stageCost(s.id);
              const budget = Number(s.budget);
              const over = cost > budget && budget > 0;
              const logged = stageLoggedHours(s.id);
              const planned = stagePlannedHours(s.id);
              const evPct = planned > 0 ? Math.min(1, logged / planned) : 0;
              const isOpen = expanded.has(s.id);
              const isActive = s.allocations.length > 0;
              return (
                <Fragment key={s.id}>
                  <tr className="border-b border-border bg-muted/20 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggle(s.id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={isOpen ? "Colapsar" : "Expandir"}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">
                            {i + 1}. {s.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {s.allocations.length === 0
                              ? "Sem responsável"
                              : `${s.allocations.length} alocaç${s.allocations.length === 1 ? "ão" : "ões"}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusDot active={isActive} label={isActive ? "Active" : "Planned"} />
                    </td>
                    <td className="px-4 py-3 min-w-[220px] w-[26%]">
                      <EVCell cost={cost} budget={budget} pct={evPct} over={over} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <UsageBudgetCell logged={logged} planned={planned} over={over} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DateLink date={parseISO(s.start_date)} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DateLink date={parseISO(s.end_date)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1 text-muted-foreground">
                        <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Atribuir">
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Mais">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isOpen &&
                    s.allocations.map((a) => {
                      const aHours =
                        Math.max(0, dayDiffInclusive(a.start_date, a.end_date)) *
                        Number(a.hours_per_day);
                      const aCost =
                        aHours *
                        effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates);
                      return (
                        <tr key={a.id} className="border-b border-border last:border-b-0">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 pl-7">
                              <div className="h-3 w-3 rounded-sm border border-border bg-muted/50" />
                              <span className="truncate text-foreground">{a.resource.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {Number(a.hours_per_day)}h/d
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusDot active label="Started" />
                          </td>
                          <td className="px-4 py-2.5 min-w-[220px]">
                            <EVCell cost={aCost} budget={0} pct={1} over={false} dimmed />
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <UsageBudgetCell logged={aHours} planned={aHours} over={false} />
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <DateLink date={parseISO(a.start_date)} />
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <DateLink date={parseISO(a.end_date)} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1 text-muted-foreground">
                              <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Atribuir">
                                <UserPlus className="h-3.5 w-3.5" />
                              </button>
                              <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Mais">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Cells ---------------------------------------------------------------

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          active ? "bg-emerald-500" : "bg-muted-foreground/40",
        )}
      />
      <span className={active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
        {label}
      </span>
    </span>
  );
}

function EVCell({
  cost,
  budget,
  pct,
  over,
  dimmed,
}: {
  cost: number;
  budget: number;
  pct: number;
  over: boolean;
  dimmed?: boolean;
}) {
  return (
    <div>
      <div className={cn("flex items-baseline justify-between text-xs", dimmed && "text-muted-foreground")}>
        <span className="font-mono">
          <span className={over ? "text-destructive font-semibold" : ""}>{euros(cost)}</span>
          <span className="text-muted-foreground"> / {euros(budget)}</span>
        </span>
        <span className="tabular-nums text-muted-foreground">{Math.round(pct * 100)}%</span>
      </div>
      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full"
          style={{
            width: `${Math.max(0, Math.min(100, pct * 100))}%`,
            backgroundColor: over ? "var(--color-budget-over)" : "var(--color-budget-spent)",
          }}
        />
      </div>
    </div>
  );
}

function UsageBudgetCell({
  logged,
  planned,
  over,
}: {
  logged: number;
  planned: number;
  over: boolean;
}) {
  const noBudget = planned <= 0;
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className={over ? "text-destructive font-semibold" : "text-foreground"}>
        {formatHm(logged)}
      </span>
      <span className="text-muted-foreground">/</span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px]",
          noBudget || over
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-foreground",
        )}
      >
        {formatHm(planned)}
      </span>
    </div>
  );
}

function DateLink({ date }: { date: Date }) {
  return (
    <span className="text-xs text-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-4">
      {format(date, "d MMM", { locale: pt })}
    </span>
  );
}

function dayDiffInclusive(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
}

function formatHm(hours: number) {
  if (!Number.isFinite(hours)) return "0h 0m";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}
