import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";
import { useResources } from "@/lib/projects/use-planner";
import { euros } from "@/lib/projects/gantt-utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/projects/resources")({
  component: ResourcesPage,
});

function ResourcesPage() {
  const { data: resources, isLoading } = useResources();
  const active = (resources ?? []).filter((r) => r.active !== false);
  const inactive = (resources ?? []).filter((r) => r.active === false);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Projectos
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Equipa</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Recursos, tarifas e capacidade. Diálogo de criação por activar.
          </p>
        </div>
        <Button disabled className="gap-1">
          <Plus className="h-4 w-4" /> Adicionar membro
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">A carregar…</p>
      ) : active.length === 0 && inactive.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Sem membros ainda.</p>
      ) : (
        <div className="mt-6 space-y-6">
          <Section title="Activos" rows={active} />
          {inactive.length > 0 && <Section title="Inactivos" rows={inactive} muted />}
        </div>
      )}
    </div>
  );
}

function Section({ title, rows, muted }: { title: string; rows: ReturnType<typeof useResources>["data"] extends infer R | undefined ? NonNullable<R> : never; muted?: boolean }) {
  return (
    <div>
      <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className={`divide-y divide-border rounded-lg border border-border bg-card ${muted ? "opacity-60" : ""}`}>
        {rows.map((r) => (
          <Link
            key={r.id}
            to="/projects/resources/$resourceId"
            params={{ resourceId: r.id }}
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-accent/40"
          >
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              {r.role && <p className="text-xs text-muted-foreground">{r.role}</p>}
            </div>
            <span className="font-mono text-xs text-muted-foreground">{euros(Number(r.hourly_rate))}/h</span>
            <span className="font-mono text-xs text-muted-foreground">{Number(r.weekly_capacity).toFixed(0)}h/sem</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
