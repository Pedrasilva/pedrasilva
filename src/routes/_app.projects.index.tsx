import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  parseISO,
  format,
} from "date-fns";
import { AppShell } from "@/components/projects/app-shell";
import {
  FinancialKpiStrip,
  type FinancialKpiData,
} from "@/components/projects/dashboard/financial-kpi-strip";
import {
  HoursKpiStrip,
  type HoursKpiData,
} from "@/components/projects/dashboard/hours-kpi-strip";
import {
  ProjectHealthTable,
  type HealthRow,
} from "@/components/projects/dashboard/project-health-table";
import {
  ProjectEffortTable,
  type EffortRow,
} from "@/components/projects/dashboard/project-effort-table";
import {
  AlertsPanel,
  overBudgetDetail,
  overrunDetail,
  type AlertItem,
} from "@/components/projects/dashboard/alerts-panel";
import {
  TeamPerformance,
  type TeamRow,
} from "@/components/projects/dashboard/team-performance";
import {
  useProjects,
  useAllStages,
  useResources,
  type ProjectStatus,
} from "@/lib/projects/use-planner";
import { allocationCost, allocationHours, workingDays } from "@/lib/projects/gantt-utils";
import {
  useDefaultResourceRates,
  effectiveCostRate,
  effectiveSaleRate,
} from "@/lib/projects/use-default-rates";
import { supabase } from "@/integrations/supabase/client";
import type { StageWithAllocations } from "@/lib/projects/types";
import { useHasPermission } from "@/hooks/use-permissions";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_app/projects/")({
  component: DashboardPage,
});

const STATUS_FILTERS: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
  { label: "All", value: "all" },
];

type Period = "week" | "month";

interface TimeEntryRow {
  user_id: string;
  task_id: string | null;
  entry_date: string;
  hours: number;
  billable: boolean;
  entry_type: "project" | "internal" | "non_working";
}

function useMonthEntries(periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ["pm-time-entries-dashboard", periodStart, periodEnd],
    queryFn: async (): Promise<TimeEntryRow[]> => {
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select("user_id, task_id, entry_date, hours, billable, entry_type")
        .gte("entry_date", periodStart)
        .lte("entry_date", periodEnd);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        hours: Number(r.hours ?? 0),
      })) as TimeEntryRow[];
    },
  });
}

function useTaskMap() {
  return useQuery({
    queryKey: ["pm-task-stage-map"],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("pm_tasks")
        .select("id, allocation_id, pm_allocations!inner(stage_id)");
      if (error) throw error;
      const map = new Map<string, string>();
      for (const t of (data ?? []) as Array<{
        id: string;
        pm_allocations: { stage_id: string } | { stage_id: string }[] | null;
      }>) {
        const stageId = Array.isArray(t.pm_allocations)
          ? t.pm_allocations[0]?.stage_id
          : t.pm_allocations?.stage_id;
        if (stageId) map.set(t.id, stageId);
      }
      return map;
    },
  });
}

function useUserResourceMap() {
  return useQuery({
    queryKey: ["pm-user-resource-map"],
    queryFn: async (): Promise<Map<string, string>> => {
      // Map auth user_id -> pm_resource via collaborator_id is not directly available;
      // fall back to mapping via pm_resources.collaborator_id and a profile-style lookup.
      // For dashboard purposes we simply load resources and trust user_id -> resource_id is
      // resolved on the entries side later through a join when needed.
      const { data, error } = await supabase.from("pm_resources").select("id, collaborator_id");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.collaborator_id) m.set(r.collaborator_id, r.id);
      }
      return m;
    },
  });
}

function DashboardPage() {
  const navigate = useNavigate();
  const { allowed: canSeeFinancials } = useHasPermission("projects.financials");
  const { allowed: canSeeTeam } = useHasPermission("projects.resources");
  const { profile } = useProjectsAuth();
  const myResourceId = profile?.resource_id ?? null;
  const { data: projects, isLoading: pLoading } = useProjects();
  const { data: allStages, isLoading: sLoading } = useAllStages();
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("active");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("month");

  const today = useMemo(() => new Date(), []);
  const periodStart = useMemo(
    () => (period === "month" ? startOfMonth(today) : startOfWeek(today, { weekStartsOn: 1 })),
    [period, today],
  );
  const periodEnd = useMemo(
    () => (period === "month" ? endOfMonth(today) : endOfWeek(today, { weekStartsOn: 1 })),
    [period, today],
  );
  const periodStartISO = format(periodStart, "yyyy-MM-dd");
  const periodEndISO = format(periodEnd, "yyyy-MM-dd");
  const periodLabel = period === "month" ? format(today, "MMMM yyyy") : "This week";

  const { data: entries, isLoading: eLoading } = useMonthEntries(periodStartISO, periodEndISO);
  const { data: taskToStage } = useTaskMap();

  // ---------- group stages and entries ----------
  const stagesByProject = useMemo(() => {
    const m = new Map<string, StageWithAllocations[]>();
    if (!allStages) return m;
    for (const s of allStages) {
      const arr = m.get(s.project_id) ?? [];
      arr.push(s);
      m.set(s.project_id, arr);
    }
    return m;
  }, [allStages]);

  const stageById = useMemo(() => {
    const m = new Map<string, StageWithAllocations>();
    for (const s of allStages ?? []) m.set(s.id, s);
    return m;
  }, [allStages]);

  const stageToProject = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of allStages ?? []) m.set(s.id, s.project_id);
    return m;
  }, [allStages]);

  // Build a fast lookup allocation_id -> resource_id via allocations.
  const taskToResource = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of allStages ?? []) {
      for (const a of s.allocations) {
        // a.id is allocation id; pm_tasks has 1:1 with allocation_id
        // The task_id we have on entries was created from this allocation.
        // We don't have task records here, but we can reconstruct via allocation
        // by storing allocation_id -> resource_id; the join below will use task->stage
        // and we re-derive resource via the most active allocation in that stage.
        m.set(a.id, a.resource_id);
      }
    }
    return m;
  }, [allStages]);

  // ---------- per-project actuals (using all entries, not just period) ----------
  const { data: allEntries } = useQuery({
    queryKey: ["pm-time-entries-all-project"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select("task_id, hours, billable, entry_type")
        .eq("entry_type", "project");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        task_id: r.task_id as string | null,
        hours: Number(r.hours ?? 0),
        billable: r.billable,
      }));
    },
  });

  const projectActuals = useMemo(() => {
    type Row = { revenue: number; cost: number; loggedHours: number };
    const m = new Map<string, Row>();
    if (!allEntries || !taskToStage) return m;
    for (const e of allEntries) {
      if (!e.task_id) continue;
      const stageId = taskToStage.get(e.task_id);
      if (!stageId) continue;
      const stage = stageById.get(stageId);
      if (!stage) continue;
      const projectId = stage.project_id;
      const allocation = stage.allocations.find((a) => taskToResource.get(a.id) === a.resource_id);
      // Use the first allocation in the stage to obtain a representative resource for rate.
      const repAlloc = allocation ?? stage.allocations[0];
      const resourceId = repAlloc?.resource_id;
      const cur = m.get(projectId) ?? { revenue: 0, cost: 0, loggedHours: 0 };
      cur.loggedHours += e.hours;
      if (resourceId) {
        const res = resources?.find((r) => r.id === resourceId);
        const sale = effectiveSaleRate(res?.hourly_rate, resourceId, defaultRates);
        const cost = effectiveCostRate(res?.cost_rate, resourceId, defaultRates);
        cur.cost += e.hours * cost;
        if (e.billable) cur.revenue += e.hours * sale;
      }
      m.set(projectId, cur);
    }
    return m;
  }, [allEntries, taskToStage, stageById, taskToResource, resources, defaultRates]);

  // Planned hours per project = Σ allocationHours across stages.
  const projectPlannedHours = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of allStages ?? []) {
      let h = 0;
      for (const a of s.allocations) h += allocationHours(a);
      m.set(s.project_id, (m.get(s.project_id) ?? 0) + h);
    }
    return m;
  }, [allStages]);

  // ---------- filtered project list ----------
  const filteredProjects = useMemo(() => {
    return (projects ?? []).filter((p) => {
      const status = (p.status ?? "active") as ProjectStatus;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.client ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [projects, statusFilter, query]);

  // ---------- Project health rows ----------
  const healthRows: HealthRow[] = useMemo(() => {
    return filteredProjects.map((p) => {
      const ps = stagesByProject.get(p.id) ?? [];
      const budget = ps.reduce((acc, s) => acc + Number(s.budget), 0);
      const actual = projectActuals.get(p.id) ?? { revenue: 0, cost: 0 };
      const profit = actual.revenue - actual.cost;
      const marginPct = actual.revenue > 0 ? (profit / actual.revenue) * 100 : 0;

      let status: HealthRow["status"] = "ok";
      let statusReason = "Healthy";
      if (ps.length === 0 && actual.revenue === 0 && actual.cost === 0) {
        status = "none";
        statusReason = "No activity";
      } else if (budget > 0 && actual.cost > budget) {
        status = "bad";
        statusReason = `Over budget (${Math.round((actual.cost / budget) * 100)}%)`;
      } else if (actual.revenue > 0 && marginPct < 0) {
        status = "bad";
        statusReason = `Negative margin`;
      } else if (budget > 0 && actual.cost / budget > 0.85) {
        status = "warn";
        statusReason = `Approaching budget (${Math.round((actual.cost / budget) * 100)}%)`;
      } else if (actual.revenue > 0 && marginPct < 15) {
        status = "warn";
        statusReason = `Low margin`;
      }

      return {
        project: p,
        budget,
        actualRevenue: actual.revenue,
        actualCost: actual.cost,
        profit,
        marginPct,
        status,
        statusReason,
      };
    });
  }, [filteredProjects, stagesByProject, projectActuals]);

  // ---------- Project effort rows (time-based view) ----------
  const effortRows: EffortRow[] = useMemo(() => {
    return filteredProjects.map((p) => {
      const planned = projectPlannedHours.get(p.id) ?? 0;
      const logged = projectActuals.get(p.id)?.loggedHours ?? 0;
      const remaining = planned - logged;
      const efficiencyPct = logged > 0 ? (planned / logged) * 100 : planned > 0 ? 100 : 0;
      const ps = stagesByProject.get(p.id) ?? [];

      let status: EffortRow["status"] = "ok";
      let statusReason = "On track";
      if (planned === 0 && logged === 0 && ps.length === 0) {
        status = "none";
        statusReason = "No activity";
      } else if (planned > 0 && logged > planned) {
        status = "bad";
        statusReason = `Overrun (${Math.round((logged / planned) * 100)}% of plan)`;
      } else if (planned > 0 && logged / planned > 0.8) {
        status = "warn";
        statusReason = `Approaching plan (${Math.round((logged / planned) * 100)}%)`;
      } else if (planned === 0 && logged > 0) {
        status = "warn";
        statusReason = "Logged time without plan";
      }

      return {
        project: p,
        plannedHours: planned,
        loggedHours: logged,
        remainingHours: remaining,
        efficiencyPct,
        status,
        statusReason,
      };
    });
  }, [filteredProjects, projectPlannedHours, projectActuals, stagesByProject]);

  // ---------- KPIs (period-scoped) ----------
  const kpi: FinancialKpiData = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let billableLogged = 0;
    let totalLogged = 0;

    for (const e of entries ?? []) {
      if (e.entry_type === "non_working") continue;
      let resourceId: string | null = null;
      if (e.task_id && taskToStage) {
        const stageId = taskToStage.get(e.task_id);
        if (stageId) {
          const stage = stageById.get(stageId);
          const repAlloc = stage?.allocations[0];
          resourceId = repAlloc?.resource_id ?? null;
        }
      }
      const res = resourceId
        ? resources?.find((r) => r.id === resourceId)
        : undefined;
      const saleRate = effectiveSaleRate(res?.hourly_rate, resourceId ?? "", defaultRates);
      const costRate = effectiveCostRate(res?.cost_rate, resourceId ?? "", defaultRates);
      cost += e.hours * costRate;
      totalLogged += e.hours;
      if (e.billable && e.entry_type === "project") {
        revenue += e.hours * saleRate;
        billableLogged += e.hours;
      }
    }

    const profit = revenue - cost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    const utilizationPct = totalLogged > 0 ? (billableLogged / totalLogged) * 100 : 0;

    // Capacity: sum weekly_capacity * working weeks in period for active resources
    let capacityHours = 0;
    const wd = workingDays(periodStartISO, periodEndISO);
    for (const r of resources ?? []) {
      if (!r.active) continue;
      const dailyCapacity = (Number(r.weekly_capacity) || 40) / 5;
      capacityHours += dailyCapacity * wd;
    }

    return {
      revenue,
      cost,
      profit,
      marginPct,
      utilizationPct,
      capacityUsedHours: totalLogged,
      capacityAvailableHours: capacityHours,
    };
  }, [entries, taskToStage, stageById, resources, defaultRates, periodStartISO, periodEndISO]);

  // ---------- Hours-only KPI (period-scoped) ----------
  const hoursKpi: HoursKpiData = useMemo(() => {
    let loggedHours = 0;
    let billableLogged = 0;
    for (const e of entries ?? []) {
      if (e.entry_type === "non_working") continue;
      loggedHours += e.hours;
      if (e.billable && e.entry_type === "project") billableLogged += e.hours;
    }

    // Planned hours within the selected period: clip allocations to [periodStart, periodEnd]
    let plannedHours = 0;
    for (const s of allStages ?? []) {
      for (const a of s.allocations) {
        const aStart = parseISO(a.start_date);
        const aEnd = parseISO(a.end_date);
        if (aEnd < periodStart || aStart > periodEnd) continue;
        const overlapStart = aStart > periodStart ? aStart : periodStart;
        const overlapEnd = aEnd < periodEnd ? aEnd : periodEnd;
        plannedHours += allocationHours({
          ...a,
          start_date: format(overlapStart, "yyyy-MM-dd"),
          end_date: format(overlapEnd, "yyyy-MM-dd"),
        });
      }
    }

    let capacityHours = 0;
    const wd = workingDays(periodStartISO, periodEndISO);
    for (const r of resources ?? []) {
      if (!r.active) continue;
      const dailyCapacity = (Number(r.weekly_capacity) || 40) / 5;
      capacityHours += dailyCapacity * wd;
    }

    const utilizationPct = loggedHours > 0 ? (billableLogged / loggedHours) * 100 : 0;

    return {
      plannedHours,
      loggedHours,
      remainingHours: plannedHours - loggedHours,
      utilizationPct,
      capacityUsedHours: loggedHours,
      capacityAvailableHours: capacityHours,
    };
  }, [entries, allStages, resources, periodStart, periodEnd, periodStartISO, periodEndISO]);

  // ---------- Team performance rows ----------
  const teamRows: TeamRow[] = useMemo(() => {
    const wd = workingDays(periodStartISO, periodEndISO);
    type Acc = { billable: number; internal: number; nonWorking: number };
    const byUser = new Map<string, Acc>();
    for (const e of entries ?? []) {
      const cur = byUser.get(e.user_id) ?? { billable: 0, internal: 0, nonWorking: 0 };
      if (e.entry_type === "non_working") cur.nonWorking += e.hours;
      else if (e.entry_type === "internal" || !e.billable) cur.internal += e.hours;
      else cur.billable += e.hours;
      byUser.set(e.user_id, cur);
    }
    const rows: TeamRow[] = [];
    for (const [userId, acc] of byUser) {
      // Try resource lookup directly by user_id (may match in tests when uuids align).
      const directRes = resources?.find((r) => r.id === userId);
      const res = directRes ?? null;
      const dailyCap = res ? (Number(res.weekly_capacity) || 40) / 5 : 8;
      rows.push({
        resourceId: userId,
        name: res?.name ?? userId.slice(0, 8),
        capacityHours: dailyCap * wd,
        billableHours: acc.billable,
        internalHours: acc.internal,
        nonWorkingHours: acc.nonWorking,
      });
    }
    return rows;
  }, [entries, resources, periodStartISO, periodEndISO]);

  /**
   * Visible team rows: full team if the user has resource visibility, otherwise
   * just the user's own row (or a synthesized empty self row if they haven't
   * logged time in this period). Production staff see only their own utilization.
   */
  const visibleTeamRows: TeamRow[] = useMemo(() => {
    if (canSeeTeam) return teamRows;
    const wd = workingDays(periodStartISO, periodEndISO);
    // Entries are keyed by auth user_id; surface the row that matches it.
    const myAuthId = (profile as unknown as { user_id?: string } | null)?.user_id;
    const meRow =
      (myAuthId && teamRows.find((r) => r.resourceId === myAuthId)) ||
      (myResourceId && teamRows.find((r) => r.resourceId === myResourceId)) ||
      null;
    if (meRow) return [meRow];
    const myRes = myResourceId ? resources?.find((r) => r.id === myResourceId) : undefined;
    const dailyCap = myRes ? (Number(myRes.weekly_capacity) || 40) / 5 : 8;
    return [
      {
        resourceId: myResourceId ?? "self",
        name: myRes?.name ?? profile?.full_name ?? "You",
        capacityHours: dailyCap * wd,
        billableHours: 0,
        internalHours: 0,
        nonWorkingHours: 0,
      },
    ];
  }, [canSeeTeam, teamRows, profile, myResourceId, resources, periodStartISO, periodEndISO]);

  // ---------- Alerts ----------
  const alerts: AlertItem[] = useMemo(() => {
    const list: AlertItem[] = [];
    // Financial alerts: only when user can see € data.
    if (canSeeFinancials) {
      for (const r of healthRows) {
        if (r.status === "bad" && r.budget > 0 && r.actualCost > r.budget) {
          list.push({
            id: `ob-${r.project.id}`,
            kind: "over_budget",
            title: `${r.project.name} is over budget`,
            detail: overBudgetDetail(r.actualCost, r.budget),
            href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
          });
        } else if (r.actualRevenue > 0 && r.marginPct < 15 && r.marginPct >= 0) {
          list.push({
            id: `lm-${r.project.id}`,
            kind: "low_margin",
            title: `${r.project.name} has low margin`,
            detail: `Margin ${Math.round(r.marginPct)}% — target ≥ 15%`,
            href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
          });
        } else if (r.actualRevenue > 0 && r.marginPct < 0) {
          list.push({
            id: `lm-${r.project.id}`,
            kind: "low_margin",
            title: `${r.project.name} has negative margin`,
            detail: `Margin ${Math.round(r.marginPct)}% — losing money`,
            href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
          });
        }
      }
    }

    // Time-based alerts (visible to everyone): overrun and approaching plan.
    for (const r of effortRows) {
      if (r.status === "bad" && r.plannedHours > 0) {
        list.push({
          id: `over-${r.project.id}`,
          kind: "overrun",
          title: `${r.project.name} is over planned hours`,
          detail: overrunDetail(r.loggedHours, r.plannedHours),
          href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
        });
      } else if (r.status === "warn" && r.plannedHours > 0 && r.loggedHours / r.plannedHours > 0.8) {
        list.push({
          id: `appr-${r.project.id}`,
          kind: "approaching_plan",
          title: `${r.project.name} approaching planned hours`,
          detail: overrunDetail(r.loggedHours, r.plannedHours),
          href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
        });
      }
    }

    // Overbooked resources: allocations within period exceeding daily capacity
    type Booking = { resourceId: string; date: string; hours: number };
    const bookings = new Map<string, number>(); // key resourceId|date
    for (const s of allStages ?? []) {
      for (const a of s.allocations) {
        const aStart = parseISO(a.start_date);
        const aEnd = parseISO(a.end_date);
        if (aEnd < periodStart || aStart > periodEnd) continue;
        const overlapStart = aStart > periodStart ? aStart : periodStart;
        const overlapEnd = aEnd < periodEnd ? aEnd : periodEnd;
        // Iterate per working day
        const dayMs = 86400000;
        for (let t = overlapStart.getTime(); t <= overlapEnd.getTime(); t += dayMs) {
          const d = new Date(t);
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          const key = `${a.resource_id}|${d.toISOString().slice(0, 10)}`;
          bookings.set(key, (bookings.get(key) ?? 0) + Number(a.hours_per_day));
        }
      }
    }
    const overbookedDays = new Map<string, number>();
    for (const [key, hours] of bookings) {
      const [resourceId] = key.split("|");
      const r = resources?.find((res) => res.id === resourceId);
      const dailyCap = r ? (Number(r.weekly_capacity) || 40) / 5 : 8;
      if (hours > dailyCap + 0.01) {
        overbookedDays.set(resourceId, (overbookedDays.get(resourceId) ?? 0) + 1);
      }
    }
    for (const [resourceId, days] of overbookedDays) {
      const r = resources?.find((res) => res.id === resourceId);
      list.push({
        id: `ob-res-${resourceId}`,
        kind: "overbooked",
        title: `${r?.name ?? "Resource"} is overbooked`,
        detail: `${days} day${days === 1 ? "" : "s"} in ${periodLabel.toLowerCase()} exceed daily capacity`,
        href: { to: "/projects/resources" },
      });
    }

    // High internal time per user (>30% of logged in period)
    for (const tr of teamRows) {
      const totalLogged = tr.billableHours + tr.internalHours;
      if (totalLogged < 8) continue;
      const internalPct = (tr.internalHours / totalLogged) * 100;
      if (internalPct > 30) {
        list.push({
          id: `hi-${tr.resourceId}`,
          kind: "high_internal",
          title: `${tr.name} has high internal time`,
          detail: `${Math.round(internalPct)}% of logged hours are internal (target ≤ 20%)`,
        });
      }
    }

    return list;
  }, [canSeeFinancials, healthRows, effortRows, allStages, resources, teamRows, periodStart, periodEnd, periodLabel]);

  const isLoading = pLoading || sLoading || eLoading;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1800px] space-y-4 px-6 pt-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Projects Dashboard
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {(["week", "month"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={
                    period === p
                      ? "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      : "rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                >
                  {p === "week" ? "This week" : "This month"}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={
                    statusFilter === f.value
                      ? "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      : "rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects or clients…"
                className="w-72 rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {canSeeFinancials ? (
          <FinancialKpiStrip data={kpi} loading={isLoading} periodLabel={periodLabel} />
        ) : (
          <HoursKpiStrip data={hoursKpi} loading={isLoading} periodLabel={periodLabel} />
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          {canSeeFinancials ? (
            <ProjectHealthTable
              rows={healthRows}
              loading={isLoading}
              onOpenProject={(id) =>
                navigate({ to: "/projects/$projectId", params: { projectId: id } })
              }
            />
          ) : (
            <ProjectEffortTable
              rows={effortRows}
              loading={isLoading}
              onOpenProject={(id) =>
                navigate({ to: "/projects/$projectId", params: { projectId: id } })
              }
            />
          )}
          <AlertsPanel alerts={alerts} loading={isLoading} />
        </div>

        <TeamPerformance
          rows={visibleTeamRows}
          loading={isLoading}
          periodLabel={periodLabel}
          title={canSeeTeam ? "Team performance" : "Your utilization"}
          subtitle={
            canSeeTeam
              ? `Utilization and billable / internal split — ${periodLabel}`
              : `Your hours and billable split — ${periodLabel}`
          }
          showSort={canSeeTeam}
        />
      </div>
    </AppShell>
  );
}

