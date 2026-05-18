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
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/projects/")({
  component: DashboardPage,
});

const STATUS_FILTER_KEYS: { key: "active" | "paused" | "archived" | "all"; value: ProjectStatus | "all" }[] = [
  { key: "active", value: "active" },
  { key: "paused", value: "paused" },
  { key: "archived", value: "archived" },
  { key: "all", value: "all" },
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

export interface UserIdentity {
  userId: string;
  resourceId: string | null;
  collaboratorId: string | null;
  name: string;
  fotoPath: string | null;
  color: string | null;
}

/**
 * Resolves auth user_id -> human-readable identity (collaborator name, photo,
 * resource id). Used across dashboard widgets so we never display raw UUIDs.
 */
function useUserIdentityMap() {
  return useQuery({
    queryKey: ["pm-user-identity-map"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, UserIdentity>> => {
      const { data, error } = await supabase.rpc("pm_list_user_resource_map");
      if (error) throw error;
      const m = new Map<string, UserIdentity>();
      for (const row of (data ?? []) as Array<{
        user_id: string;
        resource_id: string | null;
        name: string | null;
        collaborator_id: string | null;
        foto_path: string | null;
        color: string | null;
      }>) {
        m.set(row.user_id, {
          userId: row.user_id,
          resourceId: row.resource_id,
          collaboratorId: row.collaborator_id,
          name: row.name ?? "Unknown user",
          fotoPath: row.foto_path,
          color: row.color,
        });
      }
      return m;
    },
  });
}

function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("projects");
  const { can } = useMyPermissionsV2();
  // Financial visibility: KPIs in €, margins, project budget. Operational
  // people get hours-only views.
  const canSeeFinancials = can("projects.view_financials", "assigned");
  // Team-wide schedule/utilisation. Without it the dashboard collapses to
  // "your own utilization" + only your alerts.
  const canSeeTeam = can("scheduling.view_team", "team");
  const { user, profile } = useProjectsAuth();
  const myAuthId = user?.id ?? null;
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
  const periodLabel = period === "month" ? format(today, "MMMM yyyy") : t("dashboard.thisWeek");

  const { data: entries, isLoading: eLoading } = useMonthEntries(periodStartISO, periodEndISO);
  const { data: taskToStage } = useTaskMap();
  const { data: identityMap } = useUserIdentityMap();

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
        const sale = effectiveSaleRate(res?.hourly_rate, resourceId, defaultRates, !!res?.hourly_rate_is_override);
        const cost = effectiveCostRate(res?.cost_rate, resourceId, defaultRates, !!res?.hourly_rate_is_override);
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
      const saleRate = effectiveSaleRate(res?.hourly_rate, resourceId ?? "", defaultRates, !!res?.hourly_rate_is_override);
      const costRate = effectiveCostRate(res?.cost_rate, resourceId ?? "", defaultRates, !!res?.hourly_rate_is_override);
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
      const identity = identityMap?.get(userId) ?? null;
      const res = identity?.resourceId
        ? resources?.find((r) => r.id === identity.resourceId)
        : resources?.find((r) => r.id === userId);
      const dailyCap = res ? (Number(res.weekly_capacity) || 40) / 5 : 8;
      rows.push({
        resourceId: identity?.resourceId ?? userId,
        name: identity?.name ?? res?.name ?? t("team.unknownUser"),
        collaboratorId: identity?.collaboratorId ?? null,
        fotoPath: identity?.fotoPath ?? null,
        color: identity?.color ?? res?.color ?? null,
        capacityHours: dailyCap * wd,
        billableHours: acc.billable,
        internalHours: acc.internal,
        nonWorkingHours: acc.nonWorking,
      });
    }
    return rows;
  }, [entries, resources, identityMap, periodStartISO, periodEndISO, t]);

  /**
   * Visible team rows: full team if the user has resource visibility, otherwise
   * just the user's own row (or a synthesized empty self row if they haven't
   * logged time in this period). Production staff see only their own utilization.
   */
  const visibleTeamRows: TeamRow[] = useMemo(() => {
    if (canSeeTeam) return teamRows;
    const wd = workingDays(periodStartISO, periodEndISO);
    const myMappedResourceId = myAuthId ? identityMap?.get(myAuthId)?.resourceId ?? null : null;
    const meRow =
      (myAuthId && teamRows.find((r) => r.resourceId === myAuthId)) ||
      (myResourceId && teamRows.find((r) => r.resourceId === myResourceId)) ||
      (myMappedResourceId && teamRows.find((r) => r.resourceId === myMappedResourceId)) ||
      null;
    if (meRow) return [meRow];
    const myIdentity = myAuthId ? identityMap?.get(myAuthId) : undefined;
    const myRes = myResourceId ? resources?.find((r) => r.id === myResourceId) : undefined;
    const dailyCap = myRes ? (Number(myRes.weekly_capacity) || 40) / 5 : 8;
    return [
      {
        resourceId: myResourceId ?? "self",
        name: myIdentity?.name ?? myRes?.name ?? profile?.full_name ?? t("team.you"),
        collaboratorId: myIdentity?.collaboratorId ?? null,
        fotoPath: myIdentity?.fotoPath ?? null,
        color: myIdentity?.color ?? myRes?.color ?? null,
        capacityHours: dailyCap * wd,
        billableHours: 0,
        internalHours: 0,
        nonWorkingHours: 0,
      },
    ];
  }, [canSeeTeam, teamRows, myAuthId, myResourceId, resources, identityMap, profile?.full_name, periodStartISO, periodEndISO, t]);

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
            title: t("alerts.overBudget", { name: r.project.name }),
            detail: overBudgetDetail(r.actualCost, r.budget),
            href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
          });
        } else if (r.actualRevenue > 0 && r.marginPct < 15 && r.marginPct >= 0) {
          list.push({
            id: `lm-${r.project.id}`,
            kind: "low_margin",
            title: t("alerts.lowMargin", { name: r.project.name }),
            detail: t("alerts.marginTarget", { pct: Math.round(r.marginPct) }),
            href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
          });
        } else if (r.actualRevenue > 0 && r.marginPct < 0) {
          list.push({
            id: `lm-${r.project.id}`,
            kind: "low_margin",
            title: t("alerts.negativeMargin", { name: r.project.name }),
            detail: t("alerts.marginLosing", { pct: Math.round(r.marginPct) }),
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
          title: t("alerts.overrun", { name: r.project.name }),
          detail: overrunDetail(r.loggedHours, r.plannedHours),
          href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
        });
      } else if (r.status === "warn" && r.plannedHours > 0 && r.loggedHours / r.plannedHours > 0.8) {
        list.push({
          id: `appr-${r.project.id}`,
          kind: "approaching_plan",
          title: t("alerts.approachingPlan", { name: r.project.name }),
          detail: overrunDetail(r.loggedHours, r.plannedHours),
          href: { to: "/projects/$projectId", params: { projectId: r.project.id } },
        });
      }
    }

    // Overbooked resources: allocations within period exceeding daily capacity
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
      // Fallback: if a pm_resources row is missing or unnamed, look up via identity map by resource id.
      const fromIdentity = identityMap
        ? Array.from(identityMap.values()).find((i) => i.resourceId === resourceId)
        : null;
      const displayName = r?.name ?? fromIdentity?.name ?? t("team.unknownUser");
      list.push({
        id: `ob-res-${resourceId}`,
        kind: "overbooked",
        title: t("alerts.overbooked", { name: displayName }),
        detail: t("alerts.overbookedDetail", { count: days, period: periodLabel.toLowerCase() }),
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
          title: t("alerts.highInternal", { name: tr.name }),
          detail: t("alerts.highInternalDetail", { pct: Math.round(internalPct) }),
        });
      }
    }

    return list;
  }, [canSeeFinancials, healthRows, effortRows, allStages, resources, identityMap, teamRows, periodStart, periodEnd, periodLabel, t]);

  const isLoading = pLoading || sLoading || eLoading;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1800px] space-y-4 px-6 pt-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("studio")}</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {t("dashboard.title")}
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
                  {p === "week" ? t("dashboard.thisWeek") : t("dashboard.thisMonth")}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {STATUS_FILTER_KEYS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={
                    statusFilter === f.value
                      ? "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      : "rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                >
                  {t(`dashboard.filters.${f.key}`)}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("dashboard.searchPlaceholder")}
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
          title={canSeeTeam ? t("dashboard.teamPerformance") : t("dashboard.yourUtilization")}
          subtitle={
            canSeeTeam
              ? t("dashboard.subtitleTeam", { period: periodLabel })
              : t("dashboard.subtitleSelf", { period: periodLabel })
          }
          showSort={canSeeTeam}
        />
      </div>
    </AppShell>
  );
}

