import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays } from "date-fns";
import { ArrowLeft, ZoomIn, ZoomOut, GanttChartSquare, BarChart3, Receipt, Coins, Activity } from "lucide-react";
import { useProjectDetail, useResources } from "@/lib/projects/use-planner";
import { allocationCost, euros } from "@/lib/projects/gantt-utils";
import { GanttChart } from "@/components/projects/GanttChart";
import { ResourcePool } from "@/components/projects/ResourcePool";
import { NewStageDialog } from "@/components/projects/NewStageDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InsightsTabView } from "@/components/projects/dashboard/InsightsTabView";
import { BillingTabView } from "@/components/projects/dashboard/BillingTabView";
import { RatesTabView } from "@/components/projects/dashboard/RatesTabView";
import { StreamTabView } from "@/components/projects/dashboard/StreamTabView";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { data, isLoading, error } = useProjectDetail(projectId);
  const { data: resources } = useResources();
  const [dayWidth, setDayWidth] = useState(36);
  const [tab, setTab] = useState("gantt");

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
    return <div className="p-12 text-center text-sm text-muted-foreground">A carregar projecto…</div>;
  }
  if (error || !data) {
    return <div className="p-12 text-center text-sm text-destructive">Não foi possível carregar o projecto.</div>;
  }

  const { project, stages } = data;
  const totalBudget = stages.reduce((s, st) => s + Number(st.budget), 0);
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
  const overallOver = totalCost > totalBudget;

  const stagesWithProject = stages.map((s) => ({ ...s, projectId: project.id }));

  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Projectos
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: project.color }} />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{project.client ?? "—"}</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight truncate">{project.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo / Orçamento</p>
            <p className="font-mono text-sm">
              <span className={overallOver ? "font-semibold text-destructive" : ""}>{euros(totalCost)}</span>
              <span className="text-muted-foreground"> / {euros(totalBudget)}</span>
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="gantt" className="gap-1.5">
              <GanttChartSquare className="h-3.5 w-3.5" /> Gantt
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Insights
            </TabsTrigger>
            <TabsTrigger value="stream" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Stream
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> Facturação
            </TabsTrigger>
            <TabsTrigger value="rates" className="gap-1.5">
              <Coins className="h-3.5 w-3.5" /> Tarifas
            </TabsTrigger>
          </TabsList>

          {tab === "gantt" && (
            <div className="flex items-center gap-3">
              <NewStageDialog
                projectId={project.id}
                defaultStart={project.start_date}
                nextOrder={stages.length}
              />
              <div className="flex items-center gap-1 rounded-md border border-border p-1">
                <button onClick={() => setDayWidth((w) => Math.max(14, w - 4))} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Reduzir zoom">
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button onClick={() => setDayWidth((w) => Math.min(72, w + 4))} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Aumentar zoom">
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <TabsContent value="gantt" className="mt-4">
          <div className="flex gap-0" style={{ height: "calc(100vh - 320px)" }}>
            <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
              {stages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <p className="font-display text-2xl text-muted-foreground">Sem fases ainda</p>
                    <p className="mt-1 text-sm text-muted-foreground">Adicione a primeira fase para começar.</p>
                  </div>
                </div>
              ) : (
                <GanttChart
                  projectId={project.id}
                  stages={stagesWithProject}
                  origin={origin}
                  totalDays={totalDays}
                  dayWidth={dayWidth}
                  resources={resources ?? []}
                />
              )}
            </div>
            <ResourcePool resources={resources ?? []} />
          </div>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <div className="rounded-lg border border-border bg-card">
            <InsightsTabView projectId={project.id} />
          </div>
        </TabsContent>

        <TabsContent value="stream" className="mt-4">
          <div className="rounded-lg border border-border bg-card">
            <StreamTabView projectId={project.id} stages={stages} />
          </div>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <div className="rounded-lg border border-border bg-card">
            <BillingTabView project={project} stages={stages} />
          </div>
        </TabsContent>

        <TabsContent value="rates" className="mt-4">
          <div className="rounded-lg border border-border bg-card">
            <RatesTabView project={project} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
