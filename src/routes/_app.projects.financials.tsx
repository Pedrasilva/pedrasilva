import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
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
} from "lucide-react";
import { AppShell } from "@/components/projects/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
};

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


function useMonthEntries(monthStartISO: string, monthEndISO: string) {
  return useQuery({
    queryKey: ["fin-entries", monthStartISO, monthEndISO],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select("id, user_id, entry_type, billable, hours, entry_date, task_id")
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
      const util = v.billable + v.internal > 0 ? (v.billable / (v.billable + v.internal)) * 100 : 0;
      const profit = v.revenue - v.cost;
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
      };
    });
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [summary.byUser, resourceMap]);

  // 12-month trailing trend (revenue/cost/profit)
  const { data: trailing } = useTrailingTrend(monthAnchor, filteredResourceIds, resourceMap, defaults);

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
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2 text-xs">
                <Gauge className="h-4 w-4" /> Utilization
              </CardDescription>
              <CardTitle className="text-2xl">{pct(summary.utilization)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              billable / (billable + internal)
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, summary.utilization)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

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
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                    <th className="px-3 py-2.5 text-right">Cost</th>
                    <th className="px-3 py-2.5 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {userRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
                      <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.utilization)}</td>
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

