/**
 * Variance view: live project plan vs frozen contract baseline.
 * Read-only diff (date shifts, budget changes, cancelled, added).
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, GitCompare } from "lucide-react";
import { useContractVariance, type StageVarianceRow } from "@/lib/projects/use-contract-variance";

const fmtEUR = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-PT") : "—";

const fmtDeltaDays = (n: number | null) => {
  if (n == null) return "—";
  if (n === 0) return "0d";
  return n > 0 ? `+${n}d` : `${n}d`;
};

const fmtDeltaEUR = (n: number | null) => {
  if (n == null) return "—";
  if (Math.abs(n) < 0.5) return "0 €";
  const v = fmtEUR(Math.abs(n));
  return n > 0 ? `+${v}` : `−${v}`;
};

const STATE_STYLES: Record<StageVarianceRow["state"], { label: string; cls: string }> = {
  unchanged: { label: "Unchanged", cls: "bg-muted text-muted-foreground" },
  shifted: { label: "Date shift", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  rebudgeted: { label: "Re-budgeted", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  added: { label: "Added", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  removed: { label: "Removed", cls: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/15 text-destructive" },
};

export function ContractVarianceCard({ projectId }: { projectId: string }) {
  const { isLoading, hasBaseline, rows, totals } = useContractVariance(projectId);
  const [open, setOpen] = useState(false);

  if (isLoading || !hasBaseline) return null;

  const changed = rows.filter((r) => r.state !== "unchanged").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <CardTitle className="flex items-center gap-2 text-base">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <GitCompare className="h-4 w-4" />
            Variance vs contract
            <Badge variant="secondary" className="ml-2 font-normal">
              {changed} change{changed === 1 ? "" : "s"} · live {fmtEUR(totals.live)}{" "}
              vs baseline {fmtEUR(totals.baseline)} ({fmtDeltaEUR(totals.delta)})
            </Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">Read-only</span>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            How today's plan has drifted from what was agreed when this quote was
            converted. Stages match by name within their parent.
          </p>

          <div className="overflow-hidden rounded border text-sm">
            <table className="w-full">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Stage</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Start (live / baseline)</th>
                  <th className="px-2 py-1 text-right">Start Δ</th>
                  <th className="px-2 py-1 text-left">End (live / baseline)</th>
                  <th className="px-2 py-1 text-right">End Δ</th>
                  <th className="px-2 py-1 text-right">Budget (live / baseline)</th>
                  <th className="px-2 py-1 text-right">Budget Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-3 text-center text-muted-foreground">
                      No stages on either side.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const style = STATE_STYLES[r.state];
                  return (
                    <tr key={r.key} className="border-t align-top">
                      <td className="px-2 py-1">
                        {r.parentName && (
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {r.parentName}
                          </div>
                        )}
                        <div>{r.name}</div>
                      </td>
                      <td className="px-2 py-1">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${style.cls}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <div>{fmtDate(r.liveStart)}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(r.baselineStart)}</div>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {fmtDeltaDays(r.startDeltaDays)}
                      </td>
                      <td className="px-2 py-1">
                        <div>{fmtDate(r.liveEnd)}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(r.baselineEnd)}</div>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {fmtDeltaDays(r.endDeltaDays)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        <div>{fmtEUR(r.liveBudget)}</div>
                        <div className="text-xs text-muted-foreground">{fmtEUR(r.baselineBudget)}</div>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {fmtDeltaEUR(r.budgetDelta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30 text-xs">
                <tr>
                  <td className="px-2 py-1 font-medium" colSpan={6}>
                    Totals
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    <div>{fmtEUR(totals.live)}</div>
                    <div className="text-muted-foreground">{fmtEUR(totals.baseline)}</div>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums font-medium">
                    {fmtDeltaEUR(totals.delta)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
