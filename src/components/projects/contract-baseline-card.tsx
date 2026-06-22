/**
 * Read-only "Contractual baseline" card on the project page. Shows what was
 * agreed in the originating quote at conversion time. Immutable reference;
 * any drift vs the live plan is intentional (no diff view yet).
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useContractBaseline } from "@/lib/projects/use-contract-baseline";

const fmtEUR = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-PT") : "—";

export function ContractBaselineCard({ projectId }: { projectId: string }) {
  const { data, isLoading } = useContractBaseline(projectId);
  const [open, setOpen] = useState(false);

  if (isLoading || !data) return null;
  const { header, stages, payments } = data;

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
            <FileText className="h-4 w-4" />
            Contractual baseline
            <Badge variant="secondary" className="ml-2 font-normal">
              {header.quote_number ?? "Quote"} · {fmtEUR(header.total_fee)} · snapshot{" "}
              {fmtDate(header.snapshot_at)}
            </Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">Read-only</span>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-0">
          <p className="text-xs text-muted-foreground">
            What was agreed at the moment this quote was converted to a project.
            For internal reference only — the live plan above is the source of truth.
          </p>

          {stages.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Agreed stages
              </h4>
              <div className="overflow-hidden rounded border text-sm">
                <table className="w-full">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left">Stage</th>
                      <th className="px-2 py-1 text-left">Start</th>
                      <th className="px-2 py-1 text-left">End</th>
                      <th className="px-2 py-1 text-right">Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-2 py-1">{s.name}</td>
                        <td className="px-2 py-1">{fmtDate(s.start_date)}</td>
                        <td className="px-2 py-1">{fmtDate(s.end_date)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(s.budget)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {payments.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Agreed payment schedule
              </h4>
              <div className="overflow-hidden rounded border text-sm">
                <table className="w-full">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left">Label</th>
                      <th className="px-2 py-1 text-left">Stage</th>
                      <th className="px-2 py-1 text-left">Expected invoice</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-2 py-1">{p.label}</td>
                        <td className="px-2 py-1">{p.stage_name ?? "—"}</td>
                        <td className="px-2 py-1">{fmtDate(p.expected_invoice_date)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Collapse
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
