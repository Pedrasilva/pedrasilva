/**
 * Payment schedule ↔ fee reconciliation.
 *
 * Payment items store *fixed* amounts once a user edits them, so they silently
 * drift when stage sale values change later. This card compares the contract
 * fee (rolled-up stage sale values) against the scheduled inflow total and
 * lists exactly which stages are under/over-scheduled.
 */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR } from "@/lib/crm/types";
import { numberStages } from "@/lib/quotes/stage-numbering";
import { resolveScheduleItemAmount } from "@/lib/quotes/payment-generators";

interface ReconStage {
  id: string;
  name: string;
  sort_order?: number | null;
  parent_stage_id?: string | null;
  stage_role?: string | null;
}

interface ReconItem {
  stage_id?: string | null;
  direction?: string | null;
  amount_type: string;
  amount_value?: number | string | null;
  trigger_type: string;
}

export function PaymentScheduleReconciliation({
  stages,
  items,
  stageFees,
  contractTotal,
}: {
  stages: ReconStage[];
  items: ReconItem[];
  stageFees: Record<string, number>;
  contractTotal: number;
}) {
  const inflow = items.filter((it) => (it.direction ?? "inflow") === "inflow");

  const scheduledByStage = new Map<string, number>();
  let scheduleTotal = 0;
  let unassigned = 0;
  for (const it of inflow) {
    const net = resolveScheduleItemAmount(
      {
        amount_type: it.amount_type as never,
        amount_value: Number(it.amount_value ?? 0),
        trigger_type: it.trigger_type as never,
        stage_id: it.stage_id ?? null,
      },
      contractTotal,
      stageFees,
    );
    scheduleTotal += net;
    if (it.stage_id) {
      scheduledByStage.set(it.stage_id, (scheduledByStage.get(it.stage_id) ?? 0) + net);
    } else {
      unassigned += net;
    }
  }

  const delta = scheduleTotal - contractTotal;
  const balanced = Math.abs(delta) <= 0.5;

  // Candidate stages: anything billable with a fee, or anything referenced by
  // a schedule item. Skip parents whose descendants are already compared, so
  // rolled-up values are not counted twice.
  const byId = new Map(stages.map((s) => [s.id, s]));
  const candidates = new Set<string>();
  for (const s of stages) {
    if ((s.stage_role ?? "") === "client") continue;
    if ((stageFees[s.id] ?? 0) > 0) candidates.add(s.id);
  }
  for (const id of scheduledByStage.keys()) candidates.add(id);

  const hasCandidateDescendant = (id: string) =>
    stages.some((s) => {
      let p = s.parent_stage_id ?? null;
      while (p) {
        if (p === id) return candidates.has(s.id);
        p = byId.get(p)?.parent_stage_id ?? null;
      }
      return false;
    });

  const numbers = new Map(numberStages(stages).map((n) => [n.stage.id, n.number]));

  const rows = Array.from(candidates)
    .filter((id) => !hasCandidateDescendant(id))
    .map((id) => {
      const fee = Number(stageFees[id] ?? 0);
      const scheduled = Number(scheduledByStage.get(id) ?? 0);
      return { id, fee, scheduled, diff: scheduled - fee };
    })
    .filter((r) => Math.abs(r.diff) > 0.5)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return (
    <Card className={balanced ? undefined : "border-amber-500/50 bg-amber-500/5"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {balanced ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          )}
          Reconciliação — plano de pagamentos vs honorários
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <Metric label="Total do contrato (fases)" value={formatEUR(contractTotal)} />
          <Metric label="Total agendado (entradas)" value={formatEUR(scheduleTotal)} />
          <Metric
            label="Diferença"
            value={`${delta > 0 ? "+" : ""}${formatEUR(delta)}`}
            tone={balanced ? "ok" : "warn"}
          />
        </div>

        {balanced ? (
          <p className="text-xs text-muted-foreground">
            O plano de pagamentos cobre a totalidade dos honorários.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              As linhas com montante fixo não acompanham alterações ao valor de venda das fases.
              Verifique as fases abaixo ou volte a gerar o plano a partir do Gantt.
            </p>
            {rows.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Fase</th>
                      <th className="px-2 py-1.5 text-right font-medium">Honorário</th>
                      <th className="px-2 py-1.5 text-right font-medium">Agendado</th>
                      <th className="px-2 py-1.5 text-right font-medium">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const s = byId.get(r.id);
                      const label = s
                        ? `${numbers.get(r.id) ?? ""} ${s.name}`.trim()
                        : "Fase removida";
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="px-2 py-1.5">{label}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatEUR(r.fee)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatEUR(r.scheduled)}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right tabular-nums font-medium ${
                              r.diff < 0 ? "text-amber-700" : "text-sky-700"
                            }`}
                          >
                            {r.diff > 0 ? "+" : ""}
                            {formatEUR(r.diff)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {unassigned > 0.5 && (
              <p className="text-xs text-muted-foreground">
                {formatEUR(unassigned)} agendados sem fase associada.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-md border bg-background/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
