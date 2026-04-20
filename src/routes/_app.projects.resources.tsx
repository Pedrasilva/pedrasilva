import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/projects/app-shell";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDeleteResource,
  useResources,
  useUpdateResource,
  type ResourceTeam,
} from "@/lib/projects/use-planner";
import { useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { euros } from "@/lib/projects/gantt-utils";
import type { Resource } from "@/lib/projects/types";

export const Route = createFileRoute("/_app/projects/resources")({
  component: ResourcesPage,
});

type TabKey = "all" | "project" | "back_office" | "inactive";

const TEAM_LABEL: Record<ResourceTeam, string> = {
  project: "Project Team",
  back_office: "Back Office",
};

type FullResource = Resource & { team?: string | null; active?: boolean };

function ResourcesPage() {
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const update = useUpdateResource();
  const del = useDeleteResource();

  const [tab, setTab] = useState<TabKey>("all");

  const all = (resources ?? []) as FullResource[];

  const filtered = useMemo(() => {
    if (tab === "all") return all.filter((r) => r.active !== false);
    if (tab === "inactive") return all.filter((r) => r.active === false);
    return all.filter(
      (r) => r.active !== false && ((r.team as ResourceTeam) ?? "project") === tab,
    );
  }, [all, tab]);

  const counts = useMemo(() => {
    const active = all.filter((r) => r.active !== false);
    const proj = active.filter((r) => ((r.team as ResourceTeam) ?? "project") === "project").length;
    return {
      all: active.length,
      project: proj,
      back_office: active.length - proj,
      inactive: all.length - active.length,
    };
  }, [all]);

  async function toggleActive(r: FullResource, next: boolean) {
    try {
      await update.mutateAsync({ id: r.id, patch: { active: next } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <AppShell active="resources">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">People</p>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Team</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Team members are managed in HR. New collaborators added there appear here
              automatically. Click any name to edit project-specific details (rate, capacity, color).
            </p>
          </div>
        </div>

        <div className="mt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              <TabsTrigger value="all">
                All <span className="ml-1.5 text-xs text-muted-foreground">{counts.all}</span>
              </TabsTrigger>
              <TabsTrigger value="project">
                Project Team <span className="ml-1.5 text-xs text-muted-foreground">{counts.project}</span>
              </TabsTrigger>
              <TabsTrigger value="back_office">
                Back Office <span className="ml-1.5 text-xs text-muted-foreground">{counts.back_office}</span>
              </TabsTrigger>
              <TabsTrigger value="inactive">
                Inactive <span className="ml-1.5 text-xs text-muted-foreground">{counts.inactive}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Capacity</th>
                <th className="px-4 py-3 text-center">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rTeam = ((r.team as ResourceTeam) ?? "project") as ResourceTeam;
                const isActive = r.active !== false;
                return (
                  <tr key={r.id} className={`border-t border-border ${!isActive ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <Link
                        to="/projects/resources/$resourceId"
                        params={{ resourceId: r.id }}
                        className="group inline-flex items-center gap-3"
                      >
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="font-medium group-hover:underline">{r.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.role ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          rTeam === "project"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {TEAM_LABEL[rTeam]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{euros(Number(r.hourly_rate))}/h</td>
                    <td className="px-4 py-3 text-right font-mono">{Number(r.weekly_capacity)} h/wk</td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(v) => toggleActive(r, v)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Remove ${r.name} from the project team? They will remain in HR.`)) return;
                          try {
                            await del.mutateAsync(r.id);
                            toast.success("Removed");
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {all.length
                      ? `No one in this view yet.`
                      : "No team members yet. Add collaborators in the HR section to populate this list."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
