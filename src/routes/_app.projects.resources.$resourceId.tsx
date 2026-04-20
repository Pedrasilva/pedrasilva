import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useResources, useResourceRates } from "@/lib/projects/use-planner";
import { euros } from "@/lib/projects/gantt-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/projects/resources/$resourceId")({
  component: ResourceDetail,
});

function ResourceDetail() {
  const { resourceId } = Route.useParams();
  const { data: resources } = useResources();
  const { data: rates } = useResourceRates(resourceId);
  const r = (resources ?? []).find((x) => x.id === resourceId);

  if (!r) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Recurso não encontrado.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8">
      <Link to="/projects/resources" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Equipa
      </Link>

      <div className="mt-3 flex items-center gap-3 border-b border-border pb-5">
        <div className="h-5 w-5 rounded-full" style={{ backgroundColor: r.color }} />
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{r.name}</h1>
          {r.role && <p className="text-sm text-muted-foreground">{r.role}</p>}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KPI label="Tarifa hora" value={euros(Number(r.hourly_rate)) + "/h"} />
        <KPI label="Custo hora" value={euros(Number(r.cost_rate)) + "/h"} />
        <KPI label="Capacidade" value={Number(r.weekly_capacity).toFixed(0) + " h/sem"} />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Histórico de tarifas</CardTitle></CardHeader>
        <CardContent>
          {!rates?.length ? (
            <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rates.map((rate) => (
                <li key={rate.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{rate.effective_from}</span>
                  <span className="font-mono">
                    {euros(Number(rate.cost_rate))} / {euros(Number(rate.sale_rate))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}
