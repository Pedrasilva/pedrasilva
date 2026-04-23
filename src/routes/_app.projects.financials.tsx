import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  startOfWeek,
  addWeeks,
  subWeeks,
} from "date-fns";
import { useDateLocale } from "@/i18n/use-date-locale";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  Coffee,
  CalendarOff,
  Gauge,
  AlertCircle,
  Target,
  AlertTriangle,
  Settings2,
  CheckCircle2,
  Briefcase,
  Trophy,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/projects/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  useDefaultResourceRates,
  effectiveCostRate,
  effectiveSaleRate,
} from "@/lib/projects/use-default-rates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/financials")({
  component: FinancialsPage,
});

const euros = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

const hours = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} h`;

const pct = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;

type ResourceLite = {
  id: string;
  name: string;
  team: string;
  active: boolean;
  hourly_rate: number | null;
  cost_rate: number | null;
};

type EntryLite = {
  id: string;
  user_id: string;
  entry_type: "project" | "internal" | "non_working";
  billable: boolean;
  hours: number;
  entry_date: string;
  task_id: string | null;
  internal_category: string | null;
};

// Fixed list of internal cost centers (kept in sync with use-timesheet.ts).
// Listed in display order requested by product.
const INTERNAL_COST_CENTERS = [
  "Fee proposals",
  "Meetings",
  "Training",
  "Business development",
  "Admin",
] as const;

type TaskMeta = {
  task_id: string;
  resource_id: string;
  sale_rate: number | null;
};

function useResources() {
  return useQuery({
    queryKey: ["fin-resources"],
    queryFn: async (): Promise<ResourceLite[]> => {
      const { data, error } = await supabase
        .from("pm_resources")
        .select("id, name, team, active, hourly_rate, cost_rate")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ResourceLite[];
    },
  });
}

type UtilTargets = {
  utilization_target_min: number;
  utilization_target_max: number;
  internal_threshold_pct: number;
};

function useUtilTargets() {
  return useQuery({
    queryKey: ["fin-util-targets"],
    queryFn: async (): Promise<UtilTargets> => {
      const { data, error } = await supabase
        .from("bo_settings")
        .select("utilization_target_min, utilization_target_max, internal_threshold_pct")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      const row = data as {
        utilization_target_min?: number | null;
        utilization_target_max?: number | null;
        internal_threshold_pct?: number | null;
      } | null;
      return {
        utilization_target_min: Number(row?.utilization_target_min ?? 75),
        utilization_target_max: Number(row?.utilization_target_max ?? 85),
        internal_threshold_pct: Number(row?.internal_threshold_pct ?? 20),
      };
    },
  });
}

function useUpdateUtilTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: UtilTargets) => {
      const { error } = await supabase
        .from("bo_settings")
        .update({
          utilization_target_min: t.utilization_target_min,
          utilization_target_max: t.utilization_target_max,
          internal_threshold_pct: t.internal_threshold_pct,
        } as never)
        .eq("singleton", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-util-targets"] });
      toast.success("Utilization targets updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function utilizationTone(
  utilization: number,
  internalPct: number,
  targets: UtilTargets,
): { tone: "good" | "low" | "high" | "internal"; labelKey: string } {
  if (internalPct > targets.internal_threshold_pct) {
    return { tone: "internal", labelKey: "financials.utilStatus.highInternal" };
  }
  if (utilization < targets.utilization_target_min) {
    return { tone: "low", labelKey: "financials.utilStatus.underutilized" };
  }
  if (utilization > targets.utilization_target_max) {
    return { tone: "high", labelKey: "financials.utilStatus.overutilized" };
  }
  return { tone: "good", labelKey: "financials.utilStatus.onTarget" };
}

function useMonthEntries(monthStartISO: string, monthEndISO: string) {
  return useQuery({
    queryKey: ["fin-entries", monthStartISO, monthEndISO],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select("id, user_id, entry_type, billable, hours, entry_date, task_id, internal_category")
        .gte("entry_date", monthStartISO)
        .lte("entry_date", monthEndISO);
      if (error) throw error;
      const list = (entries ?? []) as EntryLite[];

      // Resolve task -> resource and sale rate
      const taskIds = Array.from(
        new Set(list.filter((e) => e.task_id).map((e) => e.task_id as string)),
      );
      let taskMeta: TaskMeta[] = [];
      if (taskIds.length > 0) {
        const { data: tdata, error: tErr } = await supabase
          .from("pm_tasks")
          .select(
            "id, allocation:pm_allocations(resource_id, resource:pm_resources(id, hourly_rate))",
          )
          .in("id", taskIds);
        if (tErr) throw tErr;
        taskMeta = ((tdata ?? []) as Array<{
          id: string;
          allocation: {
            resource_id: string;
            resource: { id: string; hourly_rate: number | null } | null;
          } | null;
        }>).map((t) => ({
          task_id: t.id,
          resource_id: t.allocation?.resource_id ?? "",
          sale_rate: t.allocation?.resource?.hourly_rate ?? null,
        }));
      }
      const taskMap = new Map(taskMeta.map((t) => [t.task_id, t]));
      return { entries: list, taskMap };
    },
  });
}

// Map user_id -> resource_id by inferring from project time entries themselves
// (each project entry has task -> allocation -> resource_id). For users with
// only internal/non-working entries in the period, we fall back to matching
// any past project entry. As a last resort, we leave them unmapped (they still
// count in totals but won't be filterable by individual).
function useUserToResource(monthStartISO: string) {
  return useQuery({
    queryKey: ["fin-user-resource", monthStartISO],
    queryFn: async (): Promise<Map<string, string>> => {
      // Pull all project-typed entries from the last 6 months to build mapping
      const sixMonthsAgo = format(subMonths(parseISO(monthStartISO), 6), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("pm_time_entries")
        .select("user_id, task_id")
        .eq("entry_type", "project")
        .gte("entry_date", sixMonthsAgo)
        .not("task_id", "is", null);
      if (error) throw error;
      const rows = (data ?? []) as { user_id: string; task_id: string | null }[];
      const taskIds = Array.from(new Set(rows.map((r) => r.task_id!).filter(Boolean)));
      if (taskIds.length === 0) return new Map();

      const { data: tdata, error: tErr } = await supabase
        .from("pm_tasks")
        .select("id, allocation:pm_allocations(resource_id)")
        .in("id", taskIds);
      if (tErr) throw tErr;
      const taskToRes = new Map<string, string>();
      for (const t of (tdata ?? []) as Array<{
        id: string;
        allocation: { resource_id: string } | null;
      }>) {
        if (t.allocation?.resource_id) taskToRes.set(t.id, t.allocation.resource_id);
      }

      const userToRes = new Map<string, string>();
      for (const r of rows) {
        if (!r.task_id) continue;
        const res = taskToRes.get(r.task_id);
        if (res && !userToRes.has(r.user_id)) userToRes.set(r.user_id, res);
      }
      return userToRes;
    },
  });
}

function useWorkingDaysInMonth(monthStartISO: string, monthEndISO: string) {
  return useQuery({
    queryKey: ["fin-working-days", monthStartISO, monthEndISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("data")
        .gte("data", monthStartISO)
        .lte("data", monthEndISO);
      if (error) throw error;
      const holidays = new Set((data ?? []).map((h) => h.data));
      const start = parseISO(monthStartISO);
      const end = parseISO(monthEndISO);
      let n = 0;
      const cur = new Date(start);
      while (cur <= end) {
        const d = cur.getDay();
        const iso = format(cur, "yyyy-MM-dd");
        if (d !== 0 && d !== 6 && !holidays.has(iso)) n++;
        cur.setDate(cur.getDate() + 1);
      }
      return n;
    },
  });
}

function FinancialsPage() {
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(new Date()));
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");

  const monthStart = format(startOfMonth(monthAnchor), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(monthAnchor), "yyyy-MM-dd");

  const { data: resources } = useResources();
  const { data: defaults } = useDefaultResourceRates();
  const { data: monthData, isLoading: entriesLoading } = useMonthEntries(monthStart, monthEnd);
  const { data: userToRes } = useUserToResource(monthStart);
  const { data: workingDays } = useWorkingDaysInMonth(monthStart, monthEnd);
  const { data: targets } = useUtilTargets();
  const effectiveTargets: UtilTargets = targets ?? {
    utilization_target_min: 75,
    utilization_target_max: 85,
    internal_threshold_pct: 20,
  };

  const resourceMap = useMemo(() => {
    const m = new Map<string, ResourceLite>();
    for (const r of resources ?? []) m.set(r.id, r);
    return m;
  }, [resources]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const r of resources ?? []) if (r.active) set.add(r.team);
    return Array.from(set).sort();
  }, [resources]);

  const filteredResources = useMemo(() => {
    return (resources ?? []).filter((r) => {
      if (!r.active) return false;
      if (teamFilter !== "all" && r.team !== teamFilter) return false;
      if (userFilter !== "all" && r.id !== userFilter) return false;
      return true;
    });
  }, [resources, teamFilter, userFilter]);

  const filteredResourceIds = useMemo(
    () => new Set(filteredResources.map((r) => r.id)),
    [filteredResources],
  );

  // Resolve each entry to its resource_id
  const resolvedEntries = useMemo(() => {
    const entries = monthData?.entries ?? [];
    const taskMap = monthData?.taskMap ?? new Map<string, TaskMeta>();
    return entries.map((e) => {
      let resourceId: string | null = null;
      if (e.entry_type === "project" && e.task_id) {
        resourceId = taskMap.get(e.task_id)?.resource_id ?? null;
      }
      if (!resourceId) {
        resourceId = userToRes?.get(e.user_id) ?? null;
      }
      return { ...e, resource_id: resourceId };
    });
  }, [monthData, userToRes]);

  const filteredEntries = useMemo(() => {
    return resolvedEntries.filter((e) => {
      if (!e.resource_id) {
        // unmapped: only include when no filter applied
        return teamFilter === "all" && userFilter === "all";
      }
      return filteredResourceIds.has(e.resource_id);
    });
  }, [resolvedEntries, filteredResourceIds, teamFilter, userFilter]);

  // Aggregate buckets, revenue, cost
  const summary = useMemo(() => {
    let billableH = 0;
    let internalH = 0;
    let nonWorkingH = 0;
    let revenue = 0;
    let cost = 0;
    const byUser = new Map<
      string,
      { billable: number; internal: number; nonWorking: number; revenue: number; cost: number }
    >();

    for (const e of filteredEntries) {
      const h = Number(e.hours) || 0;
      const res = e.resource_id ? resourceMap.get(e.resource_id) : null;
      const costRate = res ? effectiveCostRate(res.cost_rate, res.id, defaults) : 0;
      const saleRate = res
        ? (e.entry_type === "project" && monthData?.taskMap.get(e.task_id ?? "")?.sale_rate
            ? Number(monthData.taskMap.get(e.task_id ?? "")?.sale_rate)
            : effectiveSaleRate(res.hourly_rate, res.id, defaults))
        : 0;

      const entryCost = h * costRate;
      cost += entryCost;
      let entryRevenue = 0;
      if (e.entry_type === "project") {
        if (e.billable) {
          billableH += h;
          entryRevenue = h * saleRate;
          revenue += entryRevenue;
        } else {
          internalH += h;
        }
      } else if (e.entry_type === "internal") {
        internalH += h;
      } else if (e.entry_type === "non_working") {
        nonWorkingH += h;
      }

      const key = e.resource_id ?? `__user_${e.user_id}`;
      const cur = byUser.get(key) ?? {
        billable: 0,
        internal: 0,
        nonWorking: 0,
        revenue: 0,
        cost: 0,
      };
      if (e.entry_type === "project" && e.billable) cur.billable += h;
      else if (e.entry_type === "non_working") cur.nonWorking += h;
      else cur.internal += h;
      cur.revenue += entryRevenue;
      cur.cost += entryCost;
      byUser.set(key, cur);
    }

    const profit = revenue - cost;
    const totalLogged = billableH + internalH + nonWorkingH;
    const utilDenom = billableH + internalH;
    const utilization = utilDenom > 0 ? (billableH / utilDenom) * 100 : 0;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Capacity = working days × 8h × number of resources, minus non-working
    const headcount = filteredResources.length;
    const grossCapacity = (workingDays ?? 0) * 8 * headcount;
    const availableCapacity = Math.max(0, grossCapacity - nonWorkingH);
    const capacityUsed = grossCapacity > 0 ? ((billableH + internalH) / availableCapacity) * 100 : 0;

    // Impact: if internal & non-working time were 0, what would profit be?
    // Only billable hours generate revenue. The cost of internal+non-working hours
    // is a drag on margin.
    const dragHours = internalH + nonWorkingH;
    const avgCostRate = totalLogged > 0 ? cost / totalLogged : 0;
    const dragCost = dragHours * avgCostRate;

    return {
      billableH,
      internalH,
      nonWorkingH,
      totalLogged,
      revenue,
      cost,
      profit,
      utilization,
      margin,
      grossCapacity,
      availableCapacity,
      capacityUsed,
      dragHours,
      dragCost,
      byUser,
    };
  }, [filteredEntries, resourceMap, defaults, monthData, filteredResources, workingDays]);

  // Per-user table rows
  const userRows = useMemo(() => {
    const rows = Array.from(summary.byUser.entries()).map(([key, v]) => {
      const res = resourceMap.get(key);
      const total = v.billable + v.internal + v.nonWorking;
      const workingTotal = v.billable + v.internal;
      const util = workingTotal > 0 ? (v.billable / workingTotal) * 100 : 0;
      const internalPct = workingTotal > 0 ? (v.internal / workingTotal) * 100 : 0;
      const profit = v.revenue - v.cost;
      const alert = workingTotal > 0 ? utilizationTone(util, internalPct, effectiveTargets) : null;
      return {
        key,
        name: res?.name ?? "Unmapped user",
        team: res?.team ?? "—",
        billable: v.billable,
        internal: v.internal,
        nonWorking: v.nonWorking,
        total,
        revenue: v.revenue,
        cost: v.cost,
        profit,
        utilization: util,
        internalPct,
        alert,
      };
    });
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [summary.byUser, resourceMap, effectiveTargets]);

  // Alerts summary
  const alertCounts = useMemo(() => {
    let low = 0, high = 0, internal = 0, good = 0;
    for (const r of userRows) {
      if (!r.alert) continue;
      if (r.alert.tone === "low") low++;
      else if (r.alert.tone === "high") high++;
      else if (r.alert.tone === "internal") internal++;
      else good++;
    }
    return { low, high, internal, good };
  }, [userRows]);

  // Per internal cost-center aggregation (hours, cost, % of total working time)
  const internalCategoryRows = useMemo(() => {
    type Bucket = { category: string; hours: number; cost: number };
    const map = new Map<string, Bucket>();
    // Seed with the canonical 5 categories so each always shows up,
    // even when no time has been logged yet.
    for (const c of INTERNAL_COST_CENTERS) {
      map.set(c, { category: c, hours: 0, cost: 0 });
    }

    for (const e of filteredEntries) {
      if (e.entry_type !== "internal") continue;
      const cat = (e.internal_category ?? "").trim() || "Uncategorised";
      const h = Number(e.hours) || 0;
      const res = e.resource_id ? resourceMap.get(e.resource_id) : null;
      const costRate = res ? effectiveCostRate(res.cost_rate, res.id, defaults) : 0;
      const cur = map.get(cat) ?? { category: cat, hours: 0, cost: 0 };
      cur.hours += h;
      cur.cost += h * costRate;
      map.set(cat, cur);
    }

    // Total working time = billable + internal (i.e. capacity actually used,
    // excluding non-working absences). Used for "% of working time".
    const workingTotal = summary.billableH + summary.internalH;
    const internalTotalHours = summary.internalH;
    const internalTotalCost = Array.from(map.values()).reduce((a, b) => a + b.cost, 0);

    const rows = Array.from(map.values())
      .map((b) => ({
        ...b,
        pctOfWorking: workingTotal > 0 ? (b.hours / workingTotal) * 100 : 0,
        pctOfInternal: internalTotalHours > 0 ? (b.hours / internalTotalHours) * 100 : 0,
      }))
      .sort((a, b) => b.hours - a.hours);

    const top = rows.find((r) => r.hours > 0) ?? null;
    return { rows, internalTotalHours, internalTotalCost, workingTotal, top };
  }, [filteredEntries, resourceMap, defaults, summary.billableH, summary.internalH]);

  // 12-month trailing trend (revenue/cost/profit)
  const { data: trailing } = useTrailingTrend(monthAnchor, filteredResourceIds, resourceMap, defaults);

  // 12-week utilization trend
  const { data: weeklyUtil } = useWeeklyUtilTrend(monthAnchor, filteredResourceIds);

  // Business Development efficiency
  const bdMonthCost = useMemo(() => {
    const bucket = internalCategoryRows.rows.find((r) => r.category === "Fee proposals");
    return { hours: bucket?.hours ?? 0, cost: bucket?.cost ?? 0 };
  }, [internalCategoryRows.rows]);
  const { data: bd } = useBusinessDevReport(monthStart, monthEnd, resourceMap, defaults);


  return (
    <AppShell active="projects">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        {/* Header + filters */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Company financials
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
              Monthly performance
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Revenue, cost and time breakdown for{" "}
              <span className="font-medium text-foreground">
                {format(monthAnchor, "MMMM yyyy")}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-md border border-border">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMonthAnchor((d) => startOfMonth(subMonths(d, 1)))}
                className="h-9 rounded-r-none px-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-3 text-sm font-medium">
                {format(monthAnchor, "MMM yyyy")}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMonthAnchor((d) => startOfMonth(addMonths(d, 1)))}
                className="h-9 rounded-l-none px-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setUserFilter("all"); }}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "back_office" ? "Back office" : t === "project" ? "Projects" : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All people</SelectItem>
                {(resources ?? [])
                  .filter((r) => r.active && (teamFilter === "all" || r.team === teamFilter))
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <TargetsPopover targets={effectiveTargets} />
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiCard
            label="Revenue"
            value={euros(summary.revenue)}
            sub={`${hours(summary.billableH)} billable`}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="success"
            loading={entriesLoading}
          />
          <KpiCard
            label="Total cost"
            value={euros(summary.cost)}
            sub={`${hours(summary.totalLogged)} paid time`}
            icon={<Wallet className="h-4 w-4" />}
            tone="muted"
            loading={entriesLoading}
          />
          <KpiCard
            label="Profit"
            value={euros(summary.profit)}
            sub={`${pct(summary.margin)} margin`}
            icon={summary.profit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            tone={summary.profit >= 0 ? "primary" : "danger"}
            loading={entriesLoading}
          />
        </div>

        {/* Time breakdown + utilization + capacity */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <BucketCard
            label="Billable"
            hours={summary.billableH}
            total={summary.totalLogged}
            tone="success"
            icon={<Clock className="h-4 w-4" />}
          />
          <BucketCard
            label="Internal non-billable"
            hours={summary.internalH}
            total={summary.totalLogged}
            tone="warning"
            icon={<Coffee className="h-4 w-4" />}
          />
          <BucketCard
            label="Non-working"
            hours={summary.nonWorkingH}
            total={summary.totalLogged}
            tone="muted"
            icon={<CalendarOff className="h-4 w-4" />}
          />
          <UtilizationTargetCard
            utilization={summary.utilization}
            targets={effectiveTargets}
          />
        </div>

        {/* Alerts strip */}
        <AlertsStrip
          counts={alertCounts}
          targets={effectiveTargets}
          totalPeople={userRows.length}
        />

        {/* Capacity + Insight */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Available capacity</CardDescription>
              <CardTitle className="text-2xl">{hours(summary.availableCapacity)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Working days × 8h × people</span>
                <span className="font-medium text-foreground">{hours(summary.grossCapacity)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Less non-working</span>
                <span className="font-medium text-foreground">−{hours(summary.nonWorkingH)}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.min(
                      100,
                      summary.availableCapacity > 0
                        ? ((summary.billableH + summary.internalH) /
                            summary.availableCapacity) *
                            100
                        : 0,
                    )}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span>Utilised of available</span>
                <span className="font-medium text-foreground">
                  {pct(
                    summary.availableCapacity > 0
                      ? ((summary.billableH + summary.internalH) /
                          summary.availableCapacity) *
                          100
                      : 0,
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-dashed">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 text-xs">
                <AlertCircle className="h-4 w-4" /> Profitability insight
              </CardDescription>
              <CardTitle className="text-base">
                Internal non-billable + non-working time costs you{" "}
                <span className="text-destructive">{euros(summary.dragCost)}</span> this month
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Insight
                  label="Internal hours"
                  value={hours(summary.internalH)}
                  hint="working time without revenue"
                />
                <Insight
                  label="Non-working hours"
                  value={hours(summary.nonWorkingH)}
                  hint="leave + holidays"
                />
                <Insight
                  label="Combined cost drag"
                  value={euros(summary.dragCost)}
                  hint="hours × avg cost/h"
                  tone="danger"
                />
              </div>
              <p className="mt-3 text-xs">
                Revenue only comes from billable project hours. Every internal or absent
                hour is paid but doesn't generate income — so it directly reduces profit.
                If those hours were billable at the average rate, profit would be
                approximately{" "}
                <span className="font-medium text-foreground">
                  {euros(summary.profit + summary.dragCost)}
                </span>
                .
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Weekly utilization trend (last 12 weeks) */}
        <WeeklyUtilizationCard
          data={weeklyUtil ?? []}
          targets={effectiveTargets}
        />

        {/* Trailing 12 months */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Trailing 12 months</CardTitle>
            <CardDescription>Revenue, cost and profit per month for the current filters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trailing ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" stroke="currentColor" className="text-xs text-muted-foreground" />
                  <YAxis stroke="currentColor" className="text-xs text-muted-foreground" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <RTooltip
                    formatter={(v: number) => euros(Number(v))}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="Cost" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Per-person table */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">By person</CardTitle>
            <CardDescription>Hours, revenue, cost and profit for each person in scope</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Person</th>
                    <th className="px-3 py-2.5">Team</th>
                    <th className="px-3 py-2.5 text-right">Billable</th>
                    <th className="px-3 py-2.5 text-right">Internal</th>
                    <th className="px-3 py-2.5 text-right">Non-work</th>
                    <th className="px-3 py-2.5 text-right">Util.</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                    <th className="px-3 py-2.5 text-right">Cost</th>
                    <th className="px-3 py-2.5 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {userRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No time logged for the selected filters.
                      </td>
                    </tr>
                  )}
                  {userRows.map((r) => (
                    <tr key={r.key} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {r.team === "back_office" ? "Back office" : r.team === "project" ? "Projects" : r.team}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{hours(r.billable)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {hours(r.internal)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {hours(r.nonWorking)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums font-medium",
                          r.alert?.tone === "low" && "text-amber-600 dark:text-amber-400",
                          r.alert?.tone === "high" && "text-destructive",
                          r.alert?.tone === "internal" && "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {pct(r.utilization)}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.alert && <AlertChip tone={r.alert.tone} labelKey={r.alert.labelKey} />}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{euros(r.revenue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {euros(r.cost)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums font-medium",
                          r.profit >= 0 ? "text-foreground" : "text-destructive",
                        )}
                      >
                        {euros(r.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>



        {/* Internal cost centers report */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Internal cost centers</CardTitle>
                <CardDescription>
                  Hours and cost by internal category for {format(monthAnchor, "MMMM yyyy")}.
                  Percentages reflect share of working time (billable + internal).
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-1 text-right">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total internal
                </span>
                <span className="font-display text-xl font-semibold tabular-nums">
                  {hours(internalCategoryRows.internalTotalHours)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {euros(internalCategoryRows.internalTotalCost)} ·{" "}
                  {pct(
                    internalCategoryRows.workingTotal > 0
                      ? (internalCategoryRows.internalTotalHours /
                          internalCategoryRows.workingTotal) *
                          100
                      : 0,
                  )}{" "}
                  of working time
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {internalCategoryRows.top && internalCategoryRows.top.hours > 0 && (
              <div className="mx-4 mt-1 mb-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {internalCategoryRows.top.category}
                  </span>{" "}
                  is the largest internal cost center this month —{" "}
                  {hours(internalCategoryRows.top.hours)} ({pct(internalCategoryRows.top.pctOfWorking)} of
                  working time, {euros(internalCategoryRows.top.cost)} in cost).
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-3 py-2.5 text-right">Hours</th>
                    <th className="px-3 py-2.5 text-right">Cost</th>
                    <th className="px-3 py-2.5 text-right">% working time</th>
                    <th className="px-3 py-2.5 text-right">% of internal</th>
                    <th className="px-3 py-2.5 w-[200px]">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {internalCategoryRows.rows.map((r) => {
                    const isLargest =
                      internalCategoryRows.top?.category === r.category && r.hours > 0;
                    return (
                      <tr key={r.category} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            {r.category}
                            {isLargest && (
                              <Badge variant="secondary" className="text-[10px]">
                                Largest
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{hours(r.hours)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {euros(r.cost)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums",
                            r.pctOfWorking >= effectiveTargets.internal_threshold_pct &&
                              "font-medium text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {pct(r.pctOfWorking)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {pct(r.pctOfInternal)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(100, r.pctOfInternal)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {internalCategoryRows.internalTotalHours === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No internal time logged this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Business Development efficiency */}
        <BusinessDevCard
          monthLabel={format(monthAnchor, "MMMM yyyy")}
          monthHours={bdMonthCost.hours}
          monthCost={bdMonthCost.cost}
          data={bd}
        />
      </div>
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "primary" | "muted" | "success" | "danger";
  loading?: boolean;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    muted: "bg-muted text-foreground",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    danger: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-md", toneClass)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{loading ? "…" : value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function BucketCard({
  label,
  hours: hrs,
  total,
  tone,
  icon,
}: {
  label: string;
  hours: number;
  total: number;
  tone: "success" | "warning" | "muted";
  icon: React.ReactNode;
}) {
  const pctVal = total > 0 ? (hrs / total) * 100 : 0;
  const barClass = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    muted: "bg-muted-foreground/50",
  }[tone];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          {icon} {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{hours(hrs)}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {pct(pctVal)} of total time
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full", barClass)} style={{ width: `${Math.min(100, pctVal)}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function Insight({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone === "danger" && "text-destructive")}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// 12-month trailing trend
function useTrailingTrend(
  monthAnchor: Date,
  filteredResourceIds: Set<string>,
  resourceMap: Map<string, ResourceLite>,
  defaults: Map<string, { sale: number; cost: number }> | undefined,
) {
  const start = format(startOfMonth(subMonths(monthAnchor, 11)), "yyyy-MM-dd");
  const end = format(endOfMonth(monthAnchor), "yyyy-MM-dd");
  const filterKey = Array.from(filteredResourceIds).sort().join(",");

  return useQuery({
    queryKey: ["fin-trailing", start, end, filterKey, resourceMap.size],
    enabled: resourceMap.size > 0,
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select("user_id, entry_type, billable, hours, entry_date, task_id")
        .gte("entry_date", start)
        .lte("entry_date", end);
      if (error) throw error;
      const list = (entries ?? []) as EntryLite[];

      const taskIds = Array.from(new Set(list.filter((e) => e.task_id).map((e) => e.task_id!)));
      let taskMap = new Map<string, TaskMeta>();
      if (taskIds.length > 0) {
        const { data: tdata, error: tErr } = await supabase
          .from("pm_tasks")
          .select(
            "id, allocation:pm_allocations(resource_id, resource:pm_resources(id, hourly_rate))",
          )
          .in("id", taskIds);
        if (tErr) throw tErr;
        taskMap = new Map(
          ((tdata ?? []) as Array<{
            id: string;
            allocation: {
              resource_id: string;
              resource: { id: string; hourly_rate: number | null } | null;
            } | null;
          }>).map((t) => [
            t.id,
            {
              task_id: t.id,
              resource_id: t.allocation?.resource_id ?? "",
              sale_rate: t.allocation?.resource?.hourly_rate ?? null,
            },
          ]),
        );
      }

      // user -> resource fallback (same as main hook)
      const userToRes = new Map<string, string>();
      for (const e of list) {
        if (e.entry_type === "project" && e.task_id) {
          const r = taskMap.get(e.task_id)?.resource_id;
          if (r && !userToRes.has(e.user_id)) userToRes.set(e.user_id, r);
        }
      }

      // Build 12 buckets
      const buckets = new Map<string, { revenue: number; cost: number; profit: number; label: string }>();
      for (let i = 11; i >= 0; i--) {
        const d = subMonths(monthAnchor, i);
        const key = format(d, "yyyy-MM");
        buckets.set(key, { revenue: 0, cost: 0, profit: 0, label: format(d, "MMM") });
      }

      for (const e of list) {
        let resourceId: string | null = null;
        if (e.entry_type === "project" && e.task_id) {
          resourceId = taskMap.get(e.task_id)?.resource_id ?? null;
        }
        if (!resourceId) resourceId = userToRes.get(e.user_id) ?? null;

        if (filteredResourceIds.size > 0) {
          if (!resourceId || !filteredResourceIds.has(resourceId)) continue;
        }

        const res = resourceId ? resourceMap.get(resourceId) : null;
        const costRate = res ? effectiveCostRate(res.cost_rate, res.id, defaults) : 0;
        const saleRate = res
          ? (e.entry_type === "project" && taskMap.get(e.task_id ?? "")?.sale_rate
              ? Number(taskMap.get(e.task_id ?? "")?.sale_rate)
              : effectiveSaleRate(res.hourly_rate, res.id, defaults))
          : 0;
        const h = Number(e.hours) || 0;
        const monthKey = e.entry_date.slice(0, 7);
        const b = buckets.get(monthKey);
        if (!b) continue;
        b.cost += h * costRate;
        if (e.entry_type === "project" && e.billable) b.revenue += h * saleRate;
      }
      const arr = Array.from(buckets.values()).map((b) => ({
        ...b,
        profit: b.revenue - b.cost,
      }));
      return arr;
    },
  });
}

// ============================================================
// Utilization targets — UI components
// ============================================================

function TargetsPopover({ targets }: { targets: UtilTargets }) {
  const update = useUpdateUtilTargets();
  const [open, setOpen] = useState(false);
  const [minV, setMinV] = useState(targets.utilization_target_min);
  const [maxV, setMaxV] = useState(targets.utilization_target_max);
  const [intV, setIntV] = useState(targets.internal_threshold_pct);

  useEffect(() => {
    setMinV(targets.utilization_target_min);
    setMaxV(targets.utilization_target_max);
    setIntV(targets.internal_threshold_pct);
  }, [targets.utilization_target_min, targets.utilization_target_max, targets.internal_threshold_pct]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-2">
          <Target className="h-4 w-4" />
          {Math.round(targets.utilization_target_min)}–{Math.round(targets.utilization_target_max)}%
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings2 className="h-4 w-4" /> Utilization targets
          </div>
          <p className="text-xs text-muted-foreground">
            Healthy range for billable / (billable + internal). People outside the range
            are flagged on the dashboard.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="util-min" className="text-xs">Min %</Label>
              <Input
                id="util-min"
                type="number"
                min={0}
                max={100}
                value={minV}
                onChange={(e) => setMinV(Number(e.target.value))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="util-max" className="text-xs">Max %</Label>
              <Input
                id="util-max"
                type="number"
                min={0}
                max={100}
                value={maxV}
                onChange={(e) => setMaxV(Number(e.target.value))}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="util-int" className="text-xs">
              Internal time alert (% of working time)
            </Label>
            <Input
              id="util-int"
              type="number"
              min={0}
              max={100}
              value={intV}
              onChange={(e) => setIntV(Number(e.target.value))}
              className="h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              Flag people whose internal non-billable time exceeds this share of working time.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (minV < 0 || maxV > 100 || minV >= maxV) {
                  toast.error("Min must be lower than max, between 0 and 100");
                  return;
                }
                update.mutate(
                  {
                    utilization_target_min: minV,
                    utilization_target_max: maxV,
                    internal_threshold_pct: intV,
                  },
                  { onSuccess: () => setOpen(false) },
                );
              }}
              disabled={update.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UtilizationTargetCard({
  utilization,
  targets,
}: {
  utilization: number;
  targets: UtilTargets;
}) {
  const inRange =
    utilization >= targets.utilization_target_min &&
    utilization <= targets.utilization_target_max;
  const below = utilization < targets.utilization_target_min;
  const above = utilization > targets.utilization_target_max;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Utilization
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Target {Math.round(targets.utilization_target_min)}–
            {Math.round(targets.utilization_target_max)}%
          </span>
        </CardDescription>
        <CardTitle
          className={cn(
            "text-2xl",
            below && "text-amber-600 dark:text-amber-400",
            above && "text-destructive",
          )}
        >
          {pct(utilization)}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
          {/* target band */}
          <div
            className="absolute inset-y-0 bg-emerald-500/20"
            style={{
              left: `${Math.min(100, targets.utilization_target_min)}%`,
              width: `${Math.max(
                0,
                Math.min(100, targets.utilization_target_max) -
                  Math.min(100, targets.utilization_target_min),
              )}%`,
            }}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0",
              inRange
                ? "bg-emerald-500"
                : below
                  ? "bg-amber-500"
                  : "bg-destructive",
            )}
            style={{ width: `${Math.min(100, utilization)}%`, opacity: 0.85 }}
          />
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {inRange ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>On target</span>
            </>
          ) : below ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span>
                {pct(targets.utilization_target_min - utilization)} below target
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <span>
                {pct(utilization - targets.utilization_target_max)} above target
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsStrip({
  counts,
  targets,
  totalPeople,
}: {
  counts: { low: number; high: number; internal: number; good: number };
  targets: UtilTargets;
  totalPeople: number;
}) {
  if (totalPeople === 0) return null;
  const anyAlerts = counts.low + counts.high + counts.internal > 0;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {anyAlerts ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        )}
        Alerts
      </div>
      <AlertChip tone="good" label={`${counts.good} on target`} subtle />
      {counts.low > 0 && (
        <AlertChip
          tone="low"
          label={`${counts.low} underutilized (< ${Math.round(targets.utilization_target_min)}%)`}
        />
      )}
      {counts.high > 0 && (
        <AlertChip
          tone="high"
          label={`${counts.high} overutilized (> ${Math.round(targets.utilization_target_max)}%)`}
        />
      )}
      {counts.internal > 0 && (
        <AlertChip
          tone="internal"
          label={`${counts.internal} high internal (> ${Math.round(targets.internal_threshold_pct)}%)`}
        />
      )}
      {!anyAlerts && (
        <span className="text-xs text-muted-foreground">
          All people in scope are within the target utilization range.
        </span>
      )}
    </div>
  );
}

function AlertChip({
  tone,
  label,
  labelKey,
  subtle,
}: {
  tone: "good" | "low" | "high" | "internal";
  label?: string;
  labelKey?: string;
  subtle?: boolean;
}) {
  const { t } = useTranslation();
  const cls = {
    good: subtle
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      : "bg-emerald-500 text-white border-transparent",
    low: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    high: "bg-destructive/15 text-destructive border-destructive/30",
    internal: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        cls,
      )}
    >
      {labelKey ? t(`projects:${labelKey}`) : label}
    </span>
  );
}

// ============================================================
// Weekly utilization trend (last 12 weeks)
// ============================================================

type WeekPoint = {
  label: string;
  weekStart: string;
  utilization: number;
  internalPct: number;
  billable: number;
  internal: number;
};

function useWeeklyUtilTrend(monthAnchor: Date, filteredResourceIds: Set<string>) {
  const end = endOfMonth(monthAnchor);
  const start = startOfWeek(subWeeks(end, 11), { weekStartsOn: 1 });
  const startISO = format(start, "yyyy-MM-dd");
  const endISO = format(end, "yyyy-MM-dd");
  const filterKey = Array.from(filteredResourceIds).sort().join(",");

  return useQuery({
    queryKey: ["fin-weekly-util", startISO, endISO, filterKey],
    queryFn: async (): Promise<WeekPoint[]> => {
      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select("user_id, entry_type, billable, hours, entry_date, task_id")
        .gte("entry_date", startISO)
        .lte("entry_date", endISO);
      if (error) throw error;
      const list = (entries ?? []) as EntryLite[];

      // Resolve task -> resource (for filtering)
      const taskIds = Array.from(new Set(list.filter((e) => e.task_id).map((e) => e.task_id!)));
      const taskRes = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data: tdata, error: tErr } = await supabase
          .from("pm_tasks")
          .select("id, allocation:pm_allocations(resource_id)")
          .in("id", taskIds);
        if (tErr) throw tErr;
        for (const t of (tdata ?? []) as Array<{
          id: string;
          allocation: { resource_id: string } | null;
        }>) {
          if (t.allocation?.resource_id) taskRes.set(t.id, t.allocation.resource_id);
        }
      }
      const userToRes = new Map<string, string>();
      for (const e of list) {
        if (e.entry_type === "project" && e.task_id) {
          const r = taskRes.get(e.task_id);
          if (r && !userToRes.has(e.user_id)) userToRes.set(e.user_id, r);
        }
      }

      // 12 week buckets
      const buckets = new Map<
        string,
        { billable: number; internal: number; label: string; weekStart: string }
      >();
      for (let i = 11; i >= 0; i--) {
        const ws = startOfWeek(subWeeks(end, i), { weekStartsOn: 1 });
        const key = format(ws, "yyyy-MM-dd");
        buckets.set(key, {
          billable: 0,
          internal: 0,
          label: format(ws, "d MMM"),
          weekStart: key,
        });
      }

      for (const e of list) {
        let resourceId: string | null = null;
        if (e.entry_type === "project" && e.task_id) {
          resourceId = taskRes.get(e.task_id) ?? null;
        }
        if (!resourceId) resourceId = userToRes.get(e.user_id) ?? null;
        if (filteredResourceIds.size > 0) {
          if (!resourceId || !filteredResourceIds.has(resourceId)) continue;
        }
        const ws = startOfWeek(parseISO(e.entry_date), { weekStartsOn: 1 });
        const key = format(ws, "yyyy-MM-dd");
        const b = buckets.get(key);
        if (!b) continue;
        const h = Number(e.hours) || 0;
        if (e.entry_type === "project" && e.billable) b.billable += h;
        else if (e.entry_type === "non_working") {
          // skip — non-working time excluded from utilization
        } else b.internal += h;
      }

      return Array.from(buckets.values()).map((b) => {
        const denom = b.billable + b.internal;
        return {
          label: b.label,
          weekStart: b.weekStart,
          billable: b.billable,
          internal: b.internal,
          utilization: denom > 0 ? (b.billable / denom) * 100 : 0,
          internalPct: denom > 0 ? (b.internal / denom) * 100 : 0,
        };
      });
    },
  });
}

function WeeklyUtilizationCard({
  data,
  targets,
}: {
  data: WeekPoint[];
  targets: UtilTargets;
}) {
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const trend = latest && prev ? latest.utilization - prev.utilization : 0;
  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Utilization trend</CardTitle>
          <CardDescription>
            Last 12 weeks · target band {Math.round(targets.utilization_target_min)}–
            {Math.round(targets.utilization_target_max)}%
          </CardDescription>
        </div>
        {latest && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              This week
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {pct(latest.utilization)}
            </div>
            <div
              className={cn(
                "text-xs tabular-nums",
                trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
              )}
            >
              {trend >= 0 ? "▲" : "▼"} {pct(Math.abs(trend))} vs prev
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                stroke="currentColor"
                className="text-xs text-muted-foreground"
              />
              <YAxis
                stroke="currentColor"
                className="text-xs text-muted-foreground"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <RTooltip
                formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name]}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* Target band as a translucent area using two reference bars */}
              <Bar
                dataKey={() => targets.utilization_target_max}
                name="Target max"
                fill="hsl(var(--primary) / 0.08)"
                stackId="band"
                isAnimationActive={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="utilization"
                name="Utilization"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="internalPct"
                name="Internal %"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={() => targets.utilization_target_min}
                name={`Min ${Math.round(targets.utilization_target_min)}%`}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="2 4"
                dot={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey={() => targets.utilization_target_max}
                name={`Max ${Math.round(targets.utilization_target_max)}%`}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="2 4"
                dot={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Business Development efficiency
// ============================================================

type ProposalRow = {
  id: string;
  titulo: string;
  valor: number;
  pipeline_status: string;
  data_proposta: string | null;
  data_decisao: string | null;
  pm_project_id: string | null;
  created_at: string;
};

type BusinessDevData = {
  inMonth: {
    submitted: number;
    won: number;
    lost: number;
    valueWon: number;
  };
  allTime: {
    total: number;
    won: number;
    lost: number;
    open: number;
    valueWon: number;
    bdHours: number;
    bdCost: number;
  };
  recentWon: Array<{
    id: string;
    titulo: string;
    valor: number;
    data_decisao: string | null;
    pm_project_id: string | null;
  }>;
};

function useBusinessDevReport(
  monthStartISO: string,
  monthEndISO: string,
  resourceMap: Map<string, ResourceLite>,
  defaults: Map<string, { sale: number; cost: number }> | undefined,
) {
  return useQuery({
    queryKey: ["fin-bd-report", monthStartISO, monthEndISO, resourceMap.size],
    enabled: resourceMap.size > 0,
    queryFn: async (): Promise<BusinessDevData> => {
      // 1. All proposals (lifetime — needed for win-rate denominator)
      const { data: proposals, error: pErr } = await supabase
        .from("fee_proposals")
        .select("id, titulo, valor, pipeline_status, data_proposta, data_decisao, pm_project_id, created_at")
        .order("data_decisao", { ascending: false, nullsFirst: false });
      if (pErr) throw pErr;
      const list = (proposals ?? []) as ProposalRow[];

      // 2. All-time "Fee proposals" internal time + cost
      const { data: bdEntries, error: eErr } = await supabase
        .from("pm_time_entries")
        .select("user_id, hours, entry_date, task_id, entry_type, internal_category, billable")
        .eq("entry_type", "internal")
        .eq("internal_category", "Fee proposals");
      if (eErr) throw eErr;
      const bdList = (bdEntries ?? []) as EntryLite[];

      // Map user_id -> resource_id (best-effort, via any project entry)
      const { data: anyProj } = await supabase
        .from("pm_time_entries")
        .select("user_id, task_id")
        .eq("entry_type", "project")
        .not("task_id", "is", null)
        .limit(2000);
      const projRows = (anyProj ?? []) as { user_id: string; task_id: string | null }[];
      const taskIds = Array.from(new Set(projRows.map((r) => r.task_id!).filter(Boolean)));
      const taskToRes = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data: tdata } = await supabase
          .from("pm_tasks")
          .select("id, allocation:pm_allocations(resource_id)")
          .in("id", taskIds);
        for (const t of (tdata ?? []) as Array<{
          id: string;
          allocation: { resource_id: string } | null;
        }>) {
          if (t.allocation?.resource_id) taskToRes.set(t.id, t.allocation.resource_id);
        }
      }
      const userToRes = new Map<string, string>();
      for (const r of projRows) {
        if (!r.task_id) continue;
        const res = taskToRes.get(r.task_id);
        if (res && !userToRes.has(r.user_id)) userToRes.set(r.user_id, res);
      }

      let bdHours = 0;
      let bdCost = 0;
      for (const e of bdList) {
        const h = Number(e.hours) || 0;
        bdHours += h;
        const resId = userToRes.get(e.user_id) ?? null;
        const res = resId ? resourceMap.get(resId) : null;
        const costRate = res ? effectiveCostRate(res.cost_rate, res.id, defaults) : 0;
        bdCost += h * costRate;
      }

      // 3. Counts
      let submittedInMonth = 0;
      let wonInMonth = 0;
      let lostInMonth = 0;
      let valueWonInMonth = 0;
      let totalProposals = 0;
      let wonAllTime = 0;
      let lostAllTime = 0;
      let openAllTime = 0;
      let valueWonAllTime = 0;
      const wonList: BusinessDevData["recentWon"] = [];

      for (const p of list) {
        totalProposals++;
        const isWon = p.pipeline_status === "ganho";
        const isLost = p.pipeline_status === "perdido";
        const isOpen = !isWon && !isLost;
        if (isWon) {
          wonAllTime++;
          valueWonAllTime += Number(p.valor) || 0;
          wonList.push({
            id: p.id,
            titulo: p.titulo,
            valor: Number(p.valor) || 0,
            data_decisao: p.data_decisao,
            pm_project_id: p.pm_project_id,
          });
        } else if (isLost) {
          lostAllTime++;
        } else if (isOpen) {
          openAllTime++;
        }

        // Submitted in month — use data_proposta if present, else created_at
        const submittedDate = p.data_proposta ?? p.created_at?.slice(0, 10) ?? null;
        if (submittedDate && submittedDate >= monthStartISO && submittedDate <= monthEndISO) {
          submittedInMonth++;
        }
        // Decision in month
        if (p.data_decisao && p.data_decisao >= monthStartISO && p.data_decisao <= monthEndISO) {
          if (isWon) {
            wonInMonth++;
            valueWonInMonth += Number(p.valor) || 0;
          } else if (isLost) {
            lostInMonth++;
          }
        }
      }

      return {
        inMonth: {
          submitted: submittedInMonth,
          won: wonInMonth,
          lost: lostInMonth,
          valueWon: valueWonInMonth,
        },
        allTime: {
          total: totalProposals,
          won: wonAllTime,
          lost: lostAllTime,
          open: openAllTime,
          valueWon: valueWonAllTime,
          bdHours,
          bdCost,
        },
        recentWon: wonList.slice(0, 5),
      };
    },
  });
}

function BusinessDevCard({
  monthLabel,
  monthHours,
  monthCost,
  data,
}: {
  monthLabel: string;
  monthHours: number;
  monthCost: number;
  data: BusinessDevData | undefined;
}) {
  const decided = (data?.allTime.won ?? 0) + (data?.allTime.lost ?? 0);
  const winRate = decided > 0 ? ((data?.allTime.won ?? 0) / decided) * 100 : 0;
  const costPerWon =
    (data?.allTime.won ?? 0) > 0 ? (data?.allTime.bdCost ?? 0) / (data!.allTime.won) : 0;
  const roi =
    (data?.allTime.bdCost ?? 0) > 0
      ? ((data?.allTime.valueWon ?? 0) / (data?.allTime.bdCost ?? 1))
      : 0;

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Briefcase className="h-5 w-5" />
              Business Development efficiency
            </CardTitle>
            <CardDescription>
              How much it costs to win work — Fee Proposal time vs. proposals submitted and won.
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {monthLabel}
            </p>
            <p className="font-display text-xl font-semibold tabular-nums">
              {hours(monthHours)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {euros(monthCost)} BD cost this month
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top metrics row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <BdMetric
            icon={<FileText className="h-4 w-4" />}
            label="Proposals submitted"
            value={(data?.allTime.total ?? 0).toLocaleString("pt-PT")}
            sub={`${data?.inMonth.submitted ?? 0} this month`}
          />
          <BdMetric
            icon={<Trophy className="h-4 w-4" />}
            label="Projects won"
            value={(data?.allTime.won ?? 0).toLocaleString("pt-PT")}
            sub={`${data?.inMonth.won ?? 0} this month`}
            tone="success"
          />
          <BdMetric
            icon={<Target className="h-4 w-4" />}
            label="Win rate"
            value={pct(winRate)}
            sub={`${decided} decided · ${data?.allTime.open ?? 0} open`}
            tone={winRate >= 50 ? "success" : winRate >= 25 ? "warning" : "danger"}
          />
          <BdMetric
            icon={<Wallet className="h-4 w-4" />}
            label="Cost per won project"
            value={euros(costPerWon)}
            sub={`${euros(data?.allTime.bdCost ?? 0)} total BD cost`}
            tone="muted"
          />
        </div>

        {/* Insight banner */}
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p>
                <span className="font-medium text-foreground">
                  {hours(data?.allTime.bdHours ?? 0)}
                </span>{" "}
                logged to <span className="font-medium">Fee proposals</span> across the company,
                costing{" "}
                <span className="font-medium text-foreground">
                  {euros(data?.allTime.bdCost ?? 0)}
                </span>
                . Each won project costs{" "}
                <span className="font-medium text-foreground">{euros(costPerWon)}</span>{" "}
                in BD effort.
              </p>
              {(data?.allTime.valueWon ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total value won:{" "}
                  <span className="font-medium text-foreground">
                    {euros(data?.allTime.valueWon ?? 0)}
                  </span>{" "}
                  · ROI:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      roi >= 5
                        ? "text-emerald-600 dark:text-emerald-400"
                        : roi >= 2
                          ? "text-foreground"
                          : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {roi.toFixed(1)}× return on BD spend
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recent wins */}
        {data?.recentWon && data.recentWon.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent wins
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Proposal</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2">Decided</th>
                    <th className="px-3 py-2">Linked project</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentWon.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{w.titulo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{euros(w.valor)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {w.data_decisao
                          ? format(parseISO(w.data_decisao), "d MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {w.pm_project_id ? (
                          <Badge variant="secondary" className="text-[10px]">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Linked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Not linked
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(data?.allTime.total ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No proposals submitted yet. Add proposals in the CRM Pipeline to track BD efficiency.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BdMetric({
  icon,
  label,
  value,
  sub,
  tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    danger: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-foreground",
  }[tone];
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", toneClass)}>
          {icon}
        </div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

