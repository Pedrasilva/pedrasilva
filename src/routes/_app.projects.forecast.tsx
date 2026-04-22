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
import { computeResourceCapacity } from "@/lib/projects/leave-capacity";
import { useResourceSchedules, dailyHoursFor } from "@/lib/projects/use-resource-schedules";
import {
  useProjectProbabilities,
  probabilityFor,
  type ProjectProbability,
} from "@/lib/projects/use-project-probabilities";
import { cn } from "@/lib/utils";

/**
 * Forecast weighting mode. The user can choose to:
 *   - "weighted"  → multiply pipeline projects by their CRM probability (default).
 *                   This is the realistic forecast.
 *   - "optimistic"→ count every planned allocation at 100%, regardless of
 *                   pipeline status. Useful as an "if everything closes" view.
 *   - "committed" → count only projects with weight === 1 (no proposal, or the
 *                   proposal is already won). The pessimistic / floor view.
 */
type ForecastMode = "weighted" | "optimistic" | "committed";

/**
 * Returns the multiplier to apply to a project's planned numbers given the
 * currently selected forecast mode. This is the only place modes are
 * interpreted — every consumer should funnel through it.
 */
function weightForMode(prob: ProjectProbability, mode: ForecastMode): number {
  if (mode === "optimistic") return 1;
  if (mode === "committed") return prob.weight === 1 ? 1 : 0;
  return prob.weight;
}

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
  // Default to "weighted" so the headline numbers always reflect the realistic
  // probability-adjusted forecast — the previous "optimistic" behaviour is
  // still one click away.
  const [mode, setMode] = useState<ForecastMode>("weighted");
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
  const { data: schedules } = useResourceSchedules();
  const { data: probabilities } = useProjectProbabilities();

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
  //
  // Each project's contribution to the "forecast totals" is multiplied by its
  // probability weight (see useProjectProbabilities + weightForMode). The
  // resource-level workload is NOT weighted because, in real life, a person
  // is allocated regardless of whether the deal closes — so we still want
  // capacity / overload alerts to reflect the full plan.
  const planned = useMemo(() => {
    type ByProj = ForecastByProject & {
      rawHours: number;
      rawRevenue: number;
      rawCost: number;
      probability: ProjectProbability;
    };
    const byProject = new Map<string, ByProj>();
    const byResource = new Map<string, { hours: number; cost: number; conflictHours: number }>();
    let totalHours = 0; // weighted
    let totalRevenue = 0; // weighted
    let totalCost = 0; // weighted
    let rawTotalHours = 0;
    let rawTotalRevenue = 0;
    let rawTotalCost = 0;
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
        rawTotalHours,
        rawTotalRevenue,
        rawTotalCost,
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
        const pId = stage.project_id;
        const prob = probabilityFor(pId, probabilities);
        const w = weightForMode(prob, mode);

        for (const d of days) {
          if (isWeekend(d)) continue;
          const iso = format(d, "yyyy-MM-dd");
          if (holidays?.has(iso)) continue;

          const onLeave = leaves.some((l) => d >= l.start && d <= l.end);

          const rawH = hpd;
          const rawR = hpd * sale;
          const rawC = hpd * cost;
          const wH = rawH * w;
          const wR = rawR * w;
          const wC = rawC * w;

          totalHours += wH;
          totalRevenue += wR;
          totalCost += wC;
          rawTotalHours += rawH;
          rawTotalRevenue += rawR;
          rawTotalCost += rawC;

          const cur =
            byProject.get(pId) ??
            ({
              projectId: pId,
              hours: 0,
              revenue: 0,
              cost: 0,
              rawHours: 0,
              rawRevenue: 0,
              rawCost: 0,
              probability: prob,
            } as ByProj);
          cur.hours += wH;
          cur.revenue += wR;
          cur.cost += wC;
          cur.rawHours += rawH;
          cur.rawRevenue += rawR;
          cur.rawCost += rawC;
          byProject.set(pId, cur);

          // Resource workload tracks the actual plan, not the weighted forecast,
          // because capacity alerts are about real human availability.
          const r = byResource.get(resource.id) ?? { hours: 0, cost: 0, conflictHours: 0 };
          r.hours += rawH;
          r.cost += rawC;
          if (onLeave) r.conflictHours += rawH;
          byResource.set(resource.id, r);

          if (onLeave) {
            conflictHours += rawH;
            const proj = projectMap.get(pId);
            conflictDetails.push({
              resourceId: resource.id,
              resourceName: resource.name,
              projectId: pId,
              projectName: proj?.name ?? "—",
              date: iso,
              hours: rawH,
            });
          }
        }
      }
    }

    return {
      byProject,
      byResource,
      totalHours,
      totalRevenue,
      totalCost,
      rawTotalHours,
      rawTotalRevenue,
      rawTotalCost,
      conflictHours,
      conflictDetails,
    };
  }, [stages, monthStart, monthEnd, defaultRates, leaveByResource, holidays, projectMap, probabilities, mode]);

  // Capacity vs planned per resource for the current month, factoring in
  // approved leave and public holidays. Used to flag people / projects whose
  // delivery capacity has been *reduced* below what was planned.
  const capacity = useMemo(() => {
    const perResource = new Map<
      string,
      {
        resourceId: string;
        resourceName: string;
        plannedHours: number;
        rawCapacity: number;
        effectiveCapacity: number;
        leaveHours: number;
        utilization: number; // planned / effective capacity
        underPressure: boolean; // planned > effective capacity
        reducedByLeave: boolean;
      }
    >();

    if (!resources) return { perResource, totalEffective: 0, totalRaw: 0, totalLeave: 0 };

    let totalEffective = 0;
    let totalRaw = 0;
    let totalLeave = 0;

    for (const r of resources) {
      // Only consider active project-team members in capacity (back-office isn't billable delivery).
      if ((r as { active?: boolean }).active === false) continue;
      const intervals = leaveByResource?.get(r.id) ?? [];
      // Pull this resource's contractual daily hours from their HR profile so
      // part-time / flexible-schedule users get the right capacity number
      // (a 4h/day user has half the capacity of a full-time peer).
      const dh = dailyHoursFor(r.id, schedules);
      const cap = computeResourceCapacity(monthStart, monthEnd, intervals, holidays, dh);
      const plannedH = planned.byResource.get(r.id)?.hours ?? 0;
      const utilization = cap.effectiveCapacityHours > 0 ? plannedH / cap.effectiveCapacityHours : plannedH > 0 ? Infinity : 0;
      perResource.set(r.id, {
        resourceId: r.id,
        resourceName: r.name,
        plannedHours: plannedH,
        rawCapacity: cap.rawCapacityHours,
        effectiveCapacity: cap.effectiveCapacityHours,
        leaveHours: cap.leaveHours,
        utilization,
        underPressure: plannedH > cap.effectiveCapacityHours + 0.01,
        reducedByLeave: cap.leaveHours > 0,
      });
      totalEffective += cap.effectiveCapacityHours;
      totalRaw += cap.rawCapacityHours;
      totalLeave += cap.leaveHours;
    }

    return { perResource, totalEffective, totalRaw, totalLeave };
  }, [resources, leaveByResource, holidays, monthStart, monthEnd, planned.byResource, schedules]);

  // Project-level pressure: any project whose assigned team is over their
  // effective (leave-reduced) capacity is "at risk".
  const projectRisk = useMemo(() => {
    type Row = {
      projectId: string;
      projectName: string;
      color: string;
      plannedHours: number;
      effectiveCapacity: number;
      leaveHours: number;
      pressuredResources: string[];
    };
    const out = new Map<string, Row>();
    if (!stages) return out;
    for (const stage of stages) {
      for (const a of stage.allocations) {
        const allocStart = parseISO(a.start_date);
        const allocEnd = parseISO(a.end_date);
        const oS = maxDate([allocStart, monthStart]);
        const oE = minDate([allocEnd, monthEnd]);
        if (oS > oE) continue;
        const cap = capacity.perResource.get(a.resource.id);
        if (!cap) continue;
        const proj = projectMap.get(stage.project_id);
        const cur =
          out.get(stage.project_id) ??
          ({
            projectId: stage.project_id,
            projectName: proj?.name ?? "—",
            color: proj?.color ?? "#888",
            plannedHours: 0,
            effectiveCapacity: 0,
            leaveHours: 0,
            pressuredResources: [],
          } as Row);
        // Aggregate resource-level numbers once per (project, resource) pair
        if (!cur.pressuredResources.includes(a.resource.id) && cap.underPressure) {
          cur.pressuredResources.push(cap.resourceName);
        }
        out.set(stage.project_id, cur);
      }
    }
    // Fill in planned + leave + capacity totals from the planned aggregate
    for (const [pId, row] of out) {
      const p = planned.byProject.get(pId);
      row.plannedHours = p?.hours ?? 0;
      // Sum the effective capacity of resources actually working on this project
      const resIds = new Set<string>();
      for (const stage of stages ?? []) {
        if (stage.project_id !== pId) continue;
        for (const a of stage.allocations) resIds.add(a.resource.id);
      }
      let eff = 0;
      let leave = 0;
      for (const id of resIds) {
        const c = capacity.perResource.get(id);
        if (!c) continue;
        eff += c.effectiveCapacity;
        leave += c.leaveHours;
      }
      row.effectiveCapacity = eff;
      row.leaveHours = leave;
    }
    return out;
  }, [stages, monthStart, monthEnd, capacity.perResource, projectMap, planned.byProject]);

  const atRiskProjects = useMemo(
    () =>
      Array.from(projectRisk.values())
        .filter((r) => r.pressuredResources.length > 0 || r.plannedHours > r.effectiveCapacity + 0.01)
        .sort((a, b) => b.plannedHours - b.effectiveCapacity - (a.plannedHours - a.effectiveCapacity)),
    [projectRisk],
  );

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
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <KpiCard
            label="Horas planeadas"
            value={hoursFmt(planned.totalHours)}
            sub={`${planned.byResource.size} pessoas alocadas`}
            icon={<Clock className="h-4 w-4" />}
            tone="muted"
          />
          <KpiCard
            label="Capacidade efectiva"
            value={hoursFmt(capacity.totalEffective)}
            sub={
              capacity.totalLeave > 0
                ? `−${hoursFmt(capacity.totalLeave)} de férias (de ${hoursFmt(capacity.totalRaw)})`
                : `${hoursFmt(capacity.totalRaw)} brutas · sem férias`
            }
            icon={<CalendarOff className="h-4 w-4" />}
            tone={
              planned.totalHours > capacity.totalEffective + 0.01
                ? "danger"
                : capacity.totalLeave > 0
                  ? "muted"
                  : "muted"
            }
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

        {/* Capacity-at-risk panel */}
        {(atRiskProjects.length > 0 || planned.totalHours > capacity.totalEffective + 0.01) && (
          <Card className="mt-4 border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Capacidade reduzida por férias
              </CardTitle>
              <CardDescription>
                Equipa com {hoursFmt(capacity.totalLeave)} de férias aprovadas este mês →
                capacidade efectiva {hoursFmt(capacity.totalEffective)} (de {hoursFmt(capacity.totalRaw)}).
                {planned.totalHours > capacity.totalEffective + 0.01 && (
                  <span className="ml-1 font-semibold text-destructive">
                    Plano excede capacidade em {hoursFmt(planned.totalHours - capacity.totalEffective)}.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            {atRiskProjects.length > 0 && (
              <CardContent className="pt-0">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Projectos sob pressão
                </p>
                <div className="grid gap-2">
                  {atRiskProjects.slice(0, 6).map((p) => {
                    const over = p.plannedHours - p.effectiveCapacity;
                    return (
                      <div
                        key={p.projectId}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="truncate font-medium">{p.projectName}</span>
                          {p.pressuredResources.length > 0 && (
                            <span className="truncate text-[11px] text-muted-foreground">
                              · {p.pressuredResources.slice(0, 3).join(", ")}
                              {p.pressuredResources.length > 3 && ` +${p.pressuredResources.length - 3}`}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs">
                          <span className="font-mono text-muted-foreground">
                            {hoursFmt(p.plannedHours)} / {hoursFmt(p.effectiveCapacity)}
                          </span>
                          {over > 0.01 && (
                            <Badge variant="destructive" className="font-mono">
                              +{hoursFmt(over)}
                            </Badge>
                          )}
                          {p.leaveHours > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                              title="Hours lost to approved leave"
                            >
                              <CalendarOff className="h-3 w-3" />
                              {hoursFmt(p.leaveHours)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
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
