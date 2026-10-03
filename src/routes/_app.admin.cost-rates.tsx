import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AdminOnly } from "@/components/AdminOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  backfillCostSnapshots,
  getCostRateStatus,
  rebuildCostRatePeriods,
  recalcCostSnapshots,
} from "@/lib/projects/cost-rates.functions";

export const Route = createFileRoute("/_app/admin/cost-rates")({
  head: () => ({ meta: [{ title: "Cost rates · PSA Hub" }] }),
  component: () => (
    <AdminOnly>
      <CostRatesPage />
    </AdminOnly>
  ),
});

function CostRatesPage() {
  const { t } = useTranslation("projects");
  const qc = useQueryClient();
  const status = useServerFn(getCostRateStatus);
  const rebuild = useServerFn(rebuildCostRatePeriods);
  const backfill = useServerFn(backfillCostSnapshots);
  const recalc = useServerFn(recalcCostSnapshots);
  const q = useQuery({ queryKey: ["cost-rate-status"], queryFn: () => status() });
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [resourceId, setResourceId] = useState<string>("");
  const done = () => qc.invalidateQueries({ queryKey: ["cost-rate-status"] });

  const mRebuild = useMutation({
    mutationFn: () => rebuild(),
    onSuccess: (r) => { toast.success(t("costRates.rebuilt", { count: r.periods })); done(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mBackfill = useMutation({
    mutationFn: () => backfill(),
    onSuccess: (r) => { toast.success(t("costRates.backfilled", { count: r.written })); done(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mRecalc = useMutation({
    mutationFn: () => recalc({ data: { from, resourceId: resourceId || null } }),
    onSuccess: (r) => { toast.success(t("costRates.recalculated", { count: r.changed })); done(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const d = q.data;
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("costRates.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("costRates.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("costRates.statusTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            {t("costRates.locked")}: live {d?.bySource.live ?? 0} · backfill {d?.bySource.backfill ?? 0} · recalc{" "}
            {d?.bySource.recalc ?? 0}
          </p>
          <p>{t("costRates.missing", { count: d?.missing ?? 0 })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={mRebuild.isPending} onClick={() => mRebuild.mutate()}>
              {t("costRates.rebuild")}
            </Button>
            <Button variant="outline" disabled={mBackfill.isPending || !d?.missing} onClick={() => mBackfill.mutate()}>
              {t("costRates.backfill")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("costRates.recalcTitle")}</CardTitle>
          <CardDescription>{t("costRates.recalcHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
          >
            <option value="">{t("costRates.everyone")}</option>
            {(d?.resources ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <Button
            disabled={mRecalc.isPending || !from}
            onClick={() => {
              if (window.confirm(t("costRates.recalcConfirm", { date: from }))) mRecalc.mutate();
            }}
          >
            {t("costRates.recalc")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("costRates.periodsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th>{t("costRates.person")}</th>
                <th>{t("costRates.from")}</th>
                <th>{t("costRates.to")}</th>
                <th className="text-right">€/h</th>
                <th>{t("costRates.inputs")}</th>
              </tr>
            </thead>
            <tbody>
              {(d?.periods ?? []).map((p, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="py-1">{p.resource_name}</td>
                  <td>{p.valid_from}</td>
                  <td>{p.valid_to ?? "—"}</td>
                  <td className="text-right tabular-nums">{p.cost_rate.toFixed(2)}</td>
                  <td className="text-xs text-muted-foreground">
                    {p.inputs.source === "manual_override"
                      ? t("costRates.manual")
                      : `VBG ${p.inputs.own_vbg} · BO ${p.inputs.bo_share} · FTE ${p.inputs.fte} · ${p.inputs.working_days}d × ${p.inputs.hours_per_day}h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("costRates.logTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(d?.log ?? []).length === 0 ? <p className="text-muted-foreground">—</p> : null}
          {(d?.log ?? []).map((l) => (
            <p key={l.id}>
              {new Date(l.run_at).toLocaleString()} · {l.kind} · {l.from_date ?? "—"} ·{" "}
              {d?.resources.find((r) => r.id === l.resource_id)?.name ?? t("costRates.everyone")} ·{" "}
              {t("costRates.changed", { count: l.entries_changed })}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
