import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/projects/app-shell";
import { ProjectValueChart } from "@/components/projects/dashboard/project-value-chart";
import { PerformanceTable } from "@/components/projects/dashboard/performance-table";
import {
  useProjects,
  useAllStages,
  useResources,
  type ProjectStatus,
} from "@/lib/projects/use-planner";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_app/projects/insights")({
  component: InsightsPage,
});

const STATUS_FILTERS: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
  { label: "All", value: "all" },
];

function useAllInvoices() {
  return useQuery({
    queryKey: ["pm-invoices-all-insights"],
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

function InsightsPage() {
  const { data: projects, isLoading: pLoading } = useProjects();
  const { data: allStages, isLoading: sLoading } = useAllStages();
  const { data: resources } = useResources();
  void useAllInvoices(); // warm cache for navigation back to dashboard
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("active");
  const [query, setQuery] = useState("");

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

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1800px] space-y-4 px-6 pt-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Projects Insights
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Analytical views: pipeline value over time and per-resource performance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

        <ProjectValueChart
          projects={filteredProjects}
          stages={allStages ?? []}
          loading={pLoading || sLoading}
        />

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
