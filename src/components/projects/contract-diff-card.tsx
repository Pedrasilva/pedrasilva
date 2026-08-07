/**
 * "Compare to contract" — derived proposed vs. actual diff view. Sits next to
 * the read-only ContractBaselineCard, which stays as the raw reference.
 */
import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, GitCompare } from "lucide-react";
import { useContractBaseline } from "@/lib/projects/use-contract-baseline";
import { useLivePlanForDiff } from "@/lib/projects/use-live-plan-for-diff";
import {
  diffPayments,
  diffStages,
  type PaymentDiffStatus,
  type StageDiffStatus,
} from "@/lib/projects/contract-diff";

const fmtEUR = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-PT") : "—";

const STAGE_LABEL: Record<StageDiffStatus, string> = {
  on_track: "On track",
  delayed: "Delayed",
  budget_changed: "Budget changed",
  removed: "Removed / skipped",
  added: "Added",
};

const PAYMENT_LABEL: Record<PaymentDiffStatus, string> = {
  as_planned: "Invoiced as planned",
  differs: "Invoiced — differs",
  not_due: "Not yet invoiced",
  overdue: "Overdue vs. contract",
  unplanned: "Unplanned billing",
};

function StatusBadge({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "info" }) {
  const cls =
    tone === "ok"
      ? "border-transparent bg-positive/10 text-positive"
      : tone === "bad"
        ? "border-transparent bg-destructive/10 text-destructive"
        : tone === "warn"
          ? "border-transparent bg-amber-500/10 text-amber-600"
          : "border-transparent bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`font-normal ${cls}`}>
      {label}
    </Badge>
  );
}

const stageTone = (s: StageDiffStatus) =>
  s === "on_track" ? "ok" : s === "removed" ? "info" : s === "added" ? "warn" : "bad";

const paymentTone = (s: PaymentDiffStatus) =>
  s === "as_planned" ? "ok" : s === "not_due" ? "info" : s === "unplanned" ? "warn" : "bad";

export function ContractDiffCard({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { data: baseline } = useContractBaseline(projectId);
  const { data: livePlan } = useLivePlanForDiff(projectId);

  const stageRows = useMemo(
    () => (baseline && livePlan ? diffStages(baseline.stages, livePlan.stages) : []),
    [baseline, livePlan],
  );
  const paymentRows = useMemo(
    () =>
      baseline && livePlan
        ? diffPayments(baseline.payments, livePlan.payments, livePlan.stages)
        : [],
    [baseline, livePlan],
  );

  if (!baseline) return null;

  const offTrack = stageRows.filter((r) => r.status !== "on_track").length;

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
            Compare to contract
            <Badge variant="secondary" className="ml-2 font-normal">
              {offTrack === 0
                ? "All stages on track"
                : `${offTrack} of ${stageRows.length} stages differ`}
            </Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">Derived</span>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 pt-0">
          <p className="text-xs text-muted-foreground">
            Agreed contract (at conversion) compared against the live plan and
            billing. The baseline itself is never changed by this view.
          </p>

          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stages
            </h4>
            <div className="overflow-x-auto rounded border text-sm">
              <table className="w-full">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Contract stage</th>
                    <th className="px-2 py-1 text-left">Live stage</th>
                    <th className="px-2 py-1 text-left">End (contract → live)</th>
                    <th className="px-2 py-1 text-right">Budget (contract → live)</th>
                    <th className="px-2 py-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stageRows.map((r) => (
                    <tr key={r.key} className="border-t align-top">
                      <td className="px-2 py-1">{r.baseline?.name ?? "—"}</td>
                      <td className="px-2 py-1">
                        {r.live?.name ?? "—"}
                        {r.matchedBy === "name" && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            (matched by name)
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {fmtDate(r.baseline?.end_date)} → {fmtDate(r.live?.end_date)}
                        {r.dayDelta != null && r.dayDelta !== 0 && (
                          <span
                            className={
                              r.dayDelta > 0 ? " text-destructive" : " text-positive"
                            }
                          >
                            {" "}
                            ({r.dayDelta > 0 ? "+" : ""}
                            {r.dayDelta}d)
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                        {fmtEUR(r.baseline?.budget)} → {fmtEUR(r.live?.budget)}
                        {r.baseline && r.live && r.budgetDelta != null && r.budgetDelta !== 0 && (
                          <span
                            className={
                              r.budgetDelta > 0 ? " text-positive" : " text-destructive"
                            }
                          >
                            {" "}
                            ({r.budgetDelta > 0 ? "+" : ""}
                            {fmtEUR(r.budgetDelta)}
                            {r.budgetPct != null
                              ? ` · ${(r.budgetPct * 100).toFixed(1)}%`
                              : ""}
                            )
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <StatusBadge
                          label={STAGE_LABEL[r.status]}
                          tone={stageTone(r.status)}
                        />
                      </td>
                    </tr>
                  ))}
                  {stageRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                        No stages to compare.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Billing
            </h4>
            <div className="overflow-x-auto rounded border text-sm">
              <table className="w-full">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Contract payment</th>
                    <th className="px-2 py-1 text-left">Live item</th>
                    <th className="px-2 py-1 text-left">Invoice date (contract → live)</th>
                    <th className="px-2 py-1 text-right">Amount (contract → live)</th>
                    <th className="px-2 py-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((r) => (
                    <tr key={r.key} className="border-t align-top">
                      <td className="px-2 py-1">{r.baseline?.label ?? "—"}</td>
                      <td className="px-2 py-1">{r.live?.label ?? "—"}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {fmtDate(r.baseline?.expected_invoice_date)} →{" "}
                        {fmtDate(r.live?.expected_invoice_date)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                        {fmtEUR(r.baseline?.amount)} → {fmtEUR(r.live?.amount_value)}
                      </td>
                      <td className="px-2 py-1">
                        <StatusBadge
                          label={PAYMENT_LABEL[r.status]}
                          tone={paymentTone(r.status)}
                        />
                      </td>
                    </tr>
                  ))}
                  {paymentRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                        No billing items to compare.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
