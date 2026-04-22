import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  parseISO,
  isWeekend,
  eachDayOfInterval,
  max as maxDate,
  min as minDate,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Wallet,
  Clock,
  AlertTriangle,
  CalendarOff,
  Target,
} from "lucide-react";
import { ResponsiveContainer, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, Line, ComposedChart } from "recharts";
import { AppShell } from "@/components/projects/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAllStages, useResources } from "@/lib/projects/use-planner";
import { useDefaultResourceRates, effectiveCostRate, effectiveSaleRate } from "@/lib/projects/use-default-rates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/forecast")({
  component: ForecastPage,
});

const euros = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );
const hoursFmt = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} h`;

type LeaveRow = {
  collaborator_id: string;
  data_inicio: string;
  data_fim: string;
  estado: string;
};

type HolidayRow = { data: string };

type ProjectRow = { id: string; name: string; color: string; client: string | null };

function useLeaveByResource() {
  return useQuery({
    queryKey: ["forecast-leave"],
    queryFn: async (): Promise<Map<string, Array<{ start: Date; end: Date }>>> => {
      // Map collaborator -> resource
      const { data: resources, error: rErr } = await supabase
        .from("pm_resources")
        .select("id, collaborator_id");
      if (rErr) throw rErr;
      const collabToResource = new Map<string, string>();
      for (const r of (resources ?? []) as { id: string; collaborator_id: string | null }[]) {
        if (r.collaborator_id) collabToResource.set(r.collaborator_id, r.id);
      }

      const { data: leaves, error: lErr } = await supabase
        .from("vacation_requests")
        .select("collaborator_id, data_inicio, data_fim, estado")
        .in("estado", ["aprovado", "aprovada"]);
      if (lErr) throw lErr;

      const map = new Map<string, Array<{ start: Date; end: Date }>>();
      for (const l of (leaves ?? []) as LeaveRow[]) {
        const resId = collabToResource.get(l.collaborator_id);
        if (!resId) continue;
        const arr = map.get(resId) ?? [];
        arr.push({ start: parseISO(l.data_inicio), end: parseISO(l.data_fim) });
        map.set(resId, arr);
      }
      return map;
    },
  });
}

function useHolidays() {
  return useQuery({
    queryKey: ["forecast-holidays"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("holidays").select("data");
      if (error) throw error;
      return new Set(((data ?? []) as HolidayRow[]).map((h) => h.data));
    },
  });
}

function useProjectsLite() {
  return useQuery({
    queryKey: ["forecast-projects"],
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase.from("pm_projects").select("id, name, color, client");
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
  });
}

// Actual hours/revenue/cost from time entries for the month
function useActualByMonth(monthStartISO: string, monthEndISO: string) {
  return useQuery({
    queryKey: ["forecast-actual", monthStartISO, monthEndISO],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select("id, user_id, entry_type, billable, hours, entry_date, task_id")
        .gte("entry_date", monthStartISO)
        .lte("entry_date", monthEndISO);
      if (error) throw error;
      const list = (entries ?? []) as Array<{
        id: string;
        user_id: string;
        entry_type: "project" | "internal" | "non_working";
        billable: boolean;
        hours: number;
        entry_date: string;
        task_id: string | null;
      }>;

      const taskIds = Array.from(new Set(list.filter((e) => e.task_id).map((e) => e.task_id as string)));
      let taskMeta = new Map<string, { resource_id: string; project_id: string; sale_rate: number | null; cost_rate: number | null }>();
      if (taskIds.length > 0) {
        const { data: tdata, error: tErr } = await supabase
          .from("pm_tasks")
          .select(
            "id, allocation:pm_allocations(resource_id, stage:pm_stages(project_id), resource:pm_resources(hourly_rate, cost_rate))",
          )
          .in("id", taskIds);
        if (tErr) throw tErr;
        for (const t of (tdata ?? []) as Array<{
          id: string;
          allocation: {
            resource_id: string;
            stage: { project_id: string } | null;
            resource: { hourly_rate: number | null; cost_rate: number | null } | null;
          } | null;
        }>) {
          if (!t.allocation) continue;
          taskMeta.set(t.id, {
            resource_id: t.allocation.resource_id,
            project_id: t.allocation.stage?.project_id ?? "",
            sale_rate: t.allocation.resource?.hourly_rate ?? null,
            cost_rate: t.allocation.resource?.cost_rate ?? null,
          });
        }
      }
      return { entries: list, taskMeta };
    },
  });
}

type ForecastByProject = {
  projectId: string;
  hours: number;
  revenue: number;
  cost: number;
};

function ForecastPage() {
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(new Date()));
  const monthStart = useMemo(() => startOfMonth(monthAnchor), [monthAnchor]);
  const monthEnd = useMemo(() => endOfMonth(monthAnchor), [monthAnchor]);
  const monthStartISO = format(monthStart, "yyyy-MM-dd");
  const monthEndISO = format(monthEnd, "yyyy-MM-dd");

  const { data: stages } = useAllStages();
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const { data: leaveByResource } = useLeaveByResource();
  const { data: holidays } = useHolidays();
  const { data: projects } = useProjectsLite();
  const { data: actual, isLoading: actualLoading } = useActualByMonth(monthStartISO, monthEndISO);

  const resourceMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; hourly_rate: number | null; cost_rate: number | null }>();
    for (const r of resources ?? []) m.set(r.id, r);
    return m;
  }, [resources]);

  const projectMap = useMemo(() => {
    const m = new Map<string, ProjectRow>();
    for (const p of projects ?? []) m.set(p.id, p);
    return m;
  }, [projects]);

  // Walk every allocation, intersect with [monthStart, monthEnd], skip weekends/holidays,
  // multiply hours_per_day by (sale, cost) rates. Track conflicts with leave.
  const planned = useMemo(() => {
    const byProject = new Map<string, ForecastByProject>();
    const byResource = new Map<string, { hours: number; cost: number; conflictHours: number }>();
    let totalHours = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let conflictHours = 0;
    const conflictDetails: Array<{
      resourceId: string;
      resourceName: string;
      projectId: string;
      projectName: string;
      date: string;
      hours: number;
    }> = [];

    if (!stages) {
      return {
        byProject,
        byResource,
        totalHours,
        totalRevenue,
        totalCost,
        conflictHours,
        conflictDetails,
      };
    }

    for (const stage of stages) {
      for (const a of stage.allocations) {
        const allocStart = parseISO(a.start_date);
        const allocEnd = parseISO(a.end_date);
        const overlapStart = maxDate([allocStart, monthStart]);
        const overlapEnd = minDate([allocEnd, monthEnd]);
        if (overlapStart > overlapEnd) continue;

        const resource = a.resource;
        const cost = effectiveCostRate(resource.cost_rate, resource.id, defaultRates);
        const sale = effectiveSaleRate(resource.hourly_rate, resource.id, defaultRates);
        const hpd = Number(a.hours_per_day);

        const leaves = leaveByResource?.get(resource.id) ?? [];
        const days = eachDayOfInterval({ start: overlapStart, end: overlapEnd });

        for (const d of days) {
          if (isWeekend(d)) continue;
          const iso = format(d, "yyyy-MM-dd");
          if (holidays?.has(iso)) continue;

          const onLeave = leaves.some((l) => d >= l.start && d <= l.end);

          totalHours += hpd;
          totalRevenue += hpd * sale;
          totalCost += hpd * cost;

          const pId = stage.project_id;
          const cur = byProject.get(pId) ?? { projectId: pId, hours: 0, revenue: 0, cost: 0 };
          cur.hours += hpd;
          cur.revenue += hpd * sale;
          cur.cost += hpd * cost;
          byProject.set(pId, cur);

          const r = byResource.get(resource.id) ?? { hours: 0, cost: 0, conflictHours: 0 };
          r.hours += hpd;
          r.cost += hpd * cost;
          if (onLeave) r.conflictHours += hpd;
          byResource.set(resource.id, r);

          if (onLeave) {
            conflictHours += hpd;
            const proj = projectMap.get(pId);
            conflictDetails.push({
              resourceId: resource.id,
              resourceName: resource.name,
              projectId: pId,
              projectName: proj?.name ?? "—",
              date: iso,
              hours: hpd,
            });
          }
        }
      }
    }

    return { byProject, byResource, totalHours, totalRevenue, totalCost, conflictHours, conflictDetails };
  }, [stages, monthStart, monthEnd, defaultRates, leaveByResource, holidays, projectMap]);

  // Aggregate actuals by project
  const actualByProject = useMemo(() => {
    const m = new Map<string, { hours: number; revenue: number; cost: number; billableHours: number }>();
    let totalH = 0;
    let totalBillH = 0;
    let totalRev = 0;
    let totalCost = 0;
    if (!actual) return { byProject: m, totalH, totalBillH, totalRev, totalCost };

    for (const e of actual.entries) {
      if (e.entry_type !== "project") continue;
      const meta = e.task_id ? actual.taskMeta.get(e.task_id) : undefined;
      if (!meta) continue;
      const resource = resourceMap.get(meta.resource_id);
      const cost = effectiveCostRate(resource?.cost_rate ?? meta.cost_rate, meta.resource_id, defaultRates);
      const sale = effectiveSaleRate(resource?.hourly_rate ?? meta.sale_rate, meta.resource_id, defaultRates);

      const cur = m.get(meta.project_id) ?? { hours: 0, revenue: 0, cost: 0, billableHours: 0 };
      cur.hours += Number(e.hours);
      cur.cost += Number(e.hours) * cost;
      if (e.billable) {
        cur.billableHours += Number(e.hours);
        cur.revenue += Number(e.hours) * sale;
      }
      m.set(meta.project_id, cur);

      totalH += Number(e.hours);
      totalCost += Number(e.hours) * cost;
      if (e.billable) {
        totalBillH += Number(e.hours);
        totalRev += Number(e.hours) * sale;
      }
    }

    return { byProject: m, totalH, totalBillH, totalRev, totalCost };
  }, [actual, resourceMap, defaultRates]);

  // 6-month forecast trend (current month + next 5)
  const trend = useMemo(() => {
    if (!stages) return [] as Array<{ label: string; revenue: number; cost: number; profit: number }>;
    const out: Array<{ label: string; revenue: number; cost: number; profit: number }> = [];
    for (let i = 0; i < 6; i++) {
      const ms = startOfMonth(addMonths(monthAnchor, i));
      const me = endOfMonth(ms);
      let rev = 0;
      let cost = 0;
      for (const stage of stages) {
        for (const a of stage.allocations) {
          const allocStart = parseISO(a.start_date);
          const allocEnd = parseISO(a.end_date);
          const oS = maxDate([allocStart, ms]);
          const oE = minDate([allocEnd, me]);
          if (oS > oE) continue;
          const resource = a.resource;
          const c = effectiveCostRate(resource.cost_rate, resource.id, defaultRates);
          const s = effectiveSaleRate(resource.hourly_rate, resource.id, defaultRates);
          const hpd = Number(a.hours_per_day);
          for (const d of eachDayOfInterval({ start: oS, end: oE })) {
            if (isWeekend(d)) continue;
            const iso = format(d, "yyyy-MM-dd");
            if (holidays?.has(iso)) continue;
            rev += hpd * s;
            cost += hpd * c;
          }
        }
      }
      out.push({ label: format(ms, "MMM yy"), revenue: rev, cost, profit: rev - cost });
    }
    return out;
  }, [stages, monthAnchor, defaultRates, holidays]);

  const profit = planned.totalRevenue - planned.totalCost;
  const margin = planned.totalRevenue > 0 ? (profit / planned.totalRevenue) * 100 : 0;
  const actualProfit = actualByProject.totalRev - actualByProject.totalCost;

  // Variance: per-project planned vs actual
  const varianceRows = useMemo(() => {
    const projectIds = new Set<string>([...planned.byProject.keys(), ...actualByProject.byProject.keys()]);
    return Array.from(projectIds)
      .map((pId) => {
        const p = planned.byProject.get(pId);
        const a = actualByProject.byProject.get(pId);
        const proj = projectMap.get(pId);
        const plannedHours = p?.hours ?? 0;
        const actualHours = a?.hours ?? 0;
        const plannedRev = p?.revenue ?? 0;
        const actualRev = a?.revenue ?? 0;
        const plannedProfit = (p?.revenue ?? 0) - (p?.cost ?? 0);
        const actualProfit = (a?.revenue ?? 0) - (a?.cost ?? 0);
        return {
          projectId: pId,
          projectName: proj?.name ?? "—",
          color: proj?.color ?? "#888",
          plannedHours,
          actualHours,
          hoursVariance: actualHours - plannedHours,
          plannedRev,
          actualRev,
          revVariance: actualRev - plannedRev,
          plannedProfit,
          actualProfit,
          profitVariance: actualProfit - plannedProfit,
        };
      })
      .sort((x, y) => Math.abs(y.profitVariance) - Math.abs(x.profitVariance));
  }, [planned.byProject, actualByProject.byProject, projectMap]);

  return (
    <AppShell active="projects">
      <div className="mx-auto w-full max-w-[1600px] px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Forecast</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Revenue, custo e lucro projectados a partir das alocações do Gantt. Compara com o real,
              detecta sobreposições com férias aprovadas e estima margens futuras.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMonthAnchor((m) => subMonths(m, 1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-3 text-sm font-medium tabular-nums min-w-[120px] text-center">
              {format(monthAnchor, "MMMM yyyy")}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
              aria-label="Mês seguinte"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="ml-2" onClick={() => setMonthAnchor(startOfMonth(new Date()))}>
              Hoje
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <KpiCard
            label="Horas planeadas"
            value={hoursFmt(planned.totalHours)}
            sub={`${planned.byResource.size} pessoas alocadas`}
            icon={<Clock className="h-4 w-4" />}
            tone="muted"
          />
          <KpiCard
            label="Receita prevista"
            value={euros(planned.totalRevenue)}
            sub={`vs real ${euros(actualByProject.totalRev)}`}
            icon={<Wallet className="h-4 w-4" />}
            tone="primary"
          />
          <KpiCard
            label="Custo previsto"
            value={euros(planned.totalCost)}
            sub={`vs real ${euros(actualByProject.totalCost)}`}
            icon={<Target className="h-4 w-4" />}
            tone="muted"
          />
          <KpiCard
            label="Lucro previsto"
            value={euros(profit)}
            sub={`Margem ${margin.toFixed(1)}% · real ${euros(actualProfit)}`}
            icon={<TrendingUp className="h-4 w-4" />}
            tone={profit >= 0 ? "success" : "danger"}
          />
        </div>

        {/* Conflict alert */}
        {planned.conflictHours > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                {hoursFmt(planned.conflictHours)} planeadas durante férias aprovadas
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {planned.conflictDetails.length} dia(s) com sobreposição. Reveja as alocações abaixo
                marcadas com <CalendarOff className="inline h-3 w-3 -mt-0.5" />.
              </p>
            </div>
          </div>
        )}

        {/* Trend chart */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Tendência de previsão (6 meses)</CardTitle>
            <CardDescription>Receita vs custo projectados a partir do Gantt actual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis tickFormatter={(v) => euros(v as number)} className="text-xs" width={70} />
                  <RTooltip
                    formatter={(v: number) => euros(v)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="Custo" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="profit" name="Lucro" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Variance table */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Variância planeado vs real — {format(monthAnchor, "MMMM yyyy")}</CardTitle>
            <CardDescription>
              Diferença entre o que foi alocado no Gantt e o que foi efectivamente registado em timesheet
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {actualLoading ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : varianceRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sem dados planeados nem reais para este mês.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Projecto</th>
                    <th className="px-2 py-2 text-right font-medium">Plan h</th>
                    <th className="px-2 py-2 text-right font-medium">Real h</th>
                    <th className="px-2 py-2 text-right font-medium">Δ h</th>
                    <th className="px-2 py-2 text-right font-medium">Plan receita</th>
                    <th className="px-2 py-2 text-right font-medium">Real receita</th>
                    <th className="px-2 py-2 text-right font-medium">Plan lucro</th>
                    <th className="px-2 py-2 text-right font-medium">Real lucro</th>
                    <th className="px-2 py-2 text-right font-medium">Δ lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceRows.map((r) => (
                    <tr key={r.projectId} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="font-medium">{r.projectName}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{hoursFmt(r.plannedHours)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{hoursFmt(r.actualHours)}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums font-medium", varianceTone(r.hoursVariance))}>
                        {r.hoursVariance >= 0 ? "+" : ""}
                        {hoursFmt(r.hoursVariance)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{euros(r.plannedRev)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{euros(r.actualRev)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{euros(r.plannedProfit)}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", r.actualProfit < 0 && "text-destructive")}>
                        {euros(r.actualProfit)}
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", varianceTone(r.profitVariance))}>
                        {r.profitVariance >= 0 ? "+" : ""}
                        {euros(r.profitVariance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Conflict details */}
        {planned.conflictDetails.length > 0 && (
          <Card className="mt-6 border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarOff className="h-4 w-4 text-destructive" />
                Conflitos com férias aprovadas
              </CardTitle>
              <CardDescription>
                Pessoas alocadas a projectos em dias em que estão de férias. Ajuste o Gantt ou rejeite o pedido.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {Array.from(
                  planned.conflictDetails.reduce((m, c) => {
                    const k = `${c.resourceId}|${c.projectId}`;
                    const cur = m.get(k) ?? { ...c, hours: 0, days: 0 };
                    cur.hours += c.hours;
                    cur.days += 1;
                    m.set(k, cur);
                    return m;
                  }, new Map<string, (typeof planned.conflictDetails)[number] & { days: number }>()).values(),
                ).map((c) => (
                  <div
                    key={`${c.resourceId}-${c.projectId}`}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="font-mono">
                        {c.days}d
                      </Badge>
                      <span className="font-medium">{c.resourceName}</span>
                      <span className="text-muted-foreground">→ {c.projectName}</span>
                    </div>
                    <span className="font-mono text-sm text-destructive">{hoursFmt(c.hours)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function varianceTone(n: number): string {
  if (n > 0.01) return "text-emerald-600 dark:text-emerald-400";
  if (n < -0.01) return "text-destructive";
  return "text-muted-foreground";
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "primary" | "muted" | "success" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span className={toneClass}>{icon}</span>
          {label}
        </div>
        <div className={cn("mt-2 font-display text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
