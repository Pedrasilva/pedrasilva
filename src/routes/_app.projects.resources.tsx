import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/projects/app-shell";
import { useResources } from "@/lib/projects/use-planner";
import { euros } from "@/lib/projects/gantt-utils";

export const Route = createFileRoute("/_app/projects/resources")({
  component: ResourcesPage,
});

function ResourcesPage() {
  const { data: resources } = useResources();
  return (
    <AppShell active="resources">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-10">
        <div className="border-b border-border pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">People</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Team</h1>
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Capacity</th>
              </tr>
            </thead>
            <tbody>
              {(resources ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="font-medium">{r.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.role ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{euros(Number(r.hourly_rate))}/h</td>
                  <td className="px-4 py-3 text-right font-mono">{Number(r.weekly_capacity)} h/wk</td>
                </tr>
              ))}
              {!resources?.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Sem membros ainda.
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
