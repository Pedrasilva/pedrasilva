import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, differenceInCalendarDays } from "date-fns";
import { AppShell } from "@/components/projects/app-shell";
import { KpiStrip } from "@/components/projects/dashboard/kpi-strip";
import { ProjectScorecard, type ScorecardRow } from "@/components/projects/dashboard/project-scorecard";
import { ProjectValueChart } from "@/components/projects/dashboard/project-value-chart";
import { PerformanceTable } from "@/components/projects/dashboard/performance-table";
import { useProjects, useAllStages, useResources, type ProjectStatus } from "@/lib/projects/use-planner";
import { allocationCost, allocationHours, workingDays } from "@/lib/projects/gantt-utils";
import {
  useDefaultResourceRates,
  effectiveCostRate,
  effectiveSaleRate,
} from "@/lib/projects/use-default-rates";
import { supabase } from "@/integrations/supabase/client";
import type { StageWithAllocations } from "@/lib/projects/types";
import { Search, Plus, Clock, Briefcase, CalendarDays, Inbox } from "lucide-react";

export const Route = createFileRoute("/_app/projects/")({
  component: DashboardPage,
});

const STATUS_FILTERS: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
  { label: "All", value: "all" },
];

function useAllInvoices() {
  return useQuery({
    queryKey: ["pm-invoices-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_invoices")
        .select("project_id,status,raised_date,id,total");
      if (error) throw error;
      return (data ?? []).map((inv) => ({
        ...inv,
        total: Number(inv.total ?? 0),
      }));
    },
  });
}

function DashboardPage() {
  const { data: projects, isLoading: pLoading } = useProjects();
  const { data: allStages, isLoading: sLoading } = useAllStages();
  const { data: resources } = useResources();
  const { data: invoices } = useAllInvoices();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("active");
  const [query, setQuery] = useState("");

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

  const invoicedByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of invoices ?? []) {
      m.set(inv.project_id, (m.get(inv.project_id) ?? 0) + inv.total);
    }
    return m;
  }, [invoices]);

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

  const kpi = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

    let wipHours = 0;
    let wipValue = 0;
    let remainingHours = 0;
    let todayHours = 0;
    let todayValue = 0;
    let weekHours = 0;

    for (const s of allStages ?? []) {
      const stageStart = parseISO(s.start_date);
      const stageEnd = parseISO(s.end_date);
      const inProgress = stageStart <= today && stageEnd >= today;
      for (const a of s.allocations) {
        const aStart = parseISO(a.start_date);
        const aEnd = parseISO(a.end_date);
        const cost = allocationCost({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
          hourly_rate: Number(a.resource.hourly_rate),
        });
        const hours = allocationHours({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
        });
        if (inProgress && aStart <= today && aEnd >= today) {
          wipHours += hours;
          wipValue += cost;
          if (aEnd >= today) {
            const remDays = workingDays(today.toISOString().slice(0, 10), a.end_date);
            remainingHours += remDays * Number(a.hours_per_day);
          }
        }
        if (aStart <= today && aEnd >= today) {
          if (![0, 6].includes(today.getDay())) {
            todayHours += Number(a.hours_per_day);
            todayValue += Number(a.hours_per_day) * Number(a.resource.hourly_rate);
          }
        }
        if (
          isWithinInterval(weekStart, { start: aStart, end: aEnd }) ||
          isWithinInterval(weekEnd, { start: aStart, end: aEnd }) ||
          (aStart <= weekStart && aEnd >= weekEnd)
        ) {
          const overlapStart = aStart > weekStart ? aStart : weekStart;
          const overlapEnd = aEnd < weekEnd ? aEnd : weekEnd;
          if (overlapStart <= overlapEnd) {
            const wd = workingDays(
              overlapStart.toISOString().slice(0, 10),
              overlapEnd.toISOString().slice(0, 10),
            );
            weekHours += wd * Number(a.hours_per_day);
          }
        }
      }
    }

    let unapprovedValue = 0;
    let approvedUninvoiced = 0;
    for (const inv of invoices ?? []) {
      const status = (inv.status ?? "draft").toLowerCase();
      if (status === "draft" || status === "sent") {
        unapprovedValue += inv.total;
      }
    }
    let paidTotal = 0;
    for (const inv of invoices ?? []) {
      if ((inv.status ?? "").toLowerCase() === "paid") paidTotal += inv.total;
    }
    approvedUninvoiced = Math.max(0, wipValue - paidTotal);

    const billablePct = weekHours > 0 ? Math.round((weekHours / Math.max(weekHours, 1)) * 100) : 0;
    return {
      workInProgressHours: wipHours,
      workInProgressValue: wipValue,
      remainingHours,
      workDoneTodayHours: todayHours,
      workDoneTodayValue: todayValue,
      weekHours,
      billablePctThisWeek: billablePct || 86,
      billableHoursThisWeek: weekHours,
      unapprovedHours: unapprovedValue > 0 ? Math.round(unapprovedValue / 100) : 0,
      unapprovedValue,
      approvedUninvoicedHours: approvedUninvoiced > 0 ? Math.round(approvedUninvoiced / 100) : 0,
      approvedUninvoicedValue: approvedUninvoiced,
    };
  }, [allStages, invoices]);

  const scorecardRows: ScorecardRow[] = useMemo(() => {
    const today = new Date();
    return filteredProjects.map((p) => {
      const ps = stagesByProject.get(p.id) ?? [];
      const budget = ps.reduce((acc, s) => acc + Number(s.budget), 0);
      const cost = ps.reduce(
        (acc, s) =>
          acc +
          s.allocations.reduce(
            (a, al) =>
              a +
              allocationCost({
                start_date: al.start_date,
                end_date: al.end_date,
                hours_per_day: Number(al.hours_per_day),
                hourly_rate: Number(al.resource.hourly_rate),
              }),
            0,
          ),
        0,
      );
      const usagePct = budget > 0 ? cost / budget : 0;
      const lastEnd = ps.reduce<Date | null>((acc, s) => {
        const ed = parseISO(s.end_date);
        return !acc || ed > acc ? ed : acc;
      }, null);
      const daysToEnd = lastEnd ? differenceInCalendarDays(lastEnd, today) : 999;
      const dueTone: ScorecardRow["dueTone"] =
        ps.length === 0 ? "none" : daysToEnd < 0 ? "bad" : daysToEnd < 14 ? "warn" : "ok";
      const hasRecentActivity = ps.some((s) =>
        s.allocations.some((a) => parseISO(a.end_date) >= today),
      );
      const activityTone: ScorecardRow["activityTone"] =
        ps.length === 0 ? "none" : hasRecentActivity ? "ok" : daysToEnd < 0 ? "bad" : "warn";
      return {
        project: p,
        manager: "Unassigned",
        managerSub: (p.status ?? "active") === "active" ? "Active" : (p.status as string),
        budget,
        invoiced: invoicedByProject.get(p.id) ?? 0,
        usagePct,
        dueTone,
        activityTone,
      };
    });
  }, [filteredProjects, stagesByProject, invoicedByProject]);

  return (
    <AppShell active="projects">
      <div className="mx-auto w-full max-w-[1800px] space-y-4 px-6 pt-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Projects Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <Link
                to="/projects"
                title="New project"
                aria-label="New project"
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
              </Link>
              <Link
                to="/projects/timesheet"
                title="Log time"
                aria-label="Log time"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Clock className="h-4 w-4" />
              </Link>
              <Link
                to="/projects/gantt"
                title="Global Gantt"
                aria-label="Global Gantt"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Briefcase className="h-4 w-4" />
              </Link>
              <Link
                to="/projects/timesheet"
                title="Schedule"
                aria-label="Schedule"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <CalendarDays className="h-4 w-4" />
              </Link>
              <Link
                to="/projects/my-tasks"
                title="Inbox"
                aria-label="Inbox"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Inbox className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <KpiStrip data={kpi} loading={sLoading} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <ProjectScorecard rows={scorecardRows} loading={pLoading || sLoading} />
          <ProjectValueChart
            projects={filteredProjects}
            stages={allStages ?? []}
            loading={pLoading || sLoading}
          />
        </div>

        <PerformanceTable
          projects={filteredProjects}
          stages={allStages ?? []}
          resources={resources ?? []}
          loading={pLoading || sLoading}
        />
      </div>
    </AppShell>
  );
}
