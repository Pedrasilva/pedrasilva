/**
 * Stage 6C — Project forecast & coverage summary card.
 *
 * Read-only operational visibility on top of:
 *  - real pm_allocations (manual planning, source of truth)
 *  - Stage 6B commercial baselines
 *  - placeholder workload envelopes
 *
 * Renders nothing for legacy projects with no allocations AND no baseline —
 * keeps existing PM views fully unchanged.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Activity, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  useProjectForecastEnvelope,
  useFreezeProjectForecastSnapshot,
} from "@/lib/project-forecasting";

function fmtEur(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(v));
}
function fmtPct(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Math.round(Number(v))}%`;
}
function fmtHrs(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Math.round(Number(v))} h`;
}

export function ProjectForecastCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation("crm");
  const { envelope, isLoading } = useProjectForecastEnvelope(projectId);
  const freeze = useFreezeProjectForecastSnapshot();

  const stageNamesQ = useQuery({
    queryKey: ["pm_stages", "names", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_stages")
        .select("id, name")
        .eq("project_id", projectId);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const s of data ?? []) map.set(s.id as string, s.name as string);
      return map;
    },
  });
  const stageNames = stageNamesQ.data;

  if (isLoading) return null;
  if (!envelope) return null;

  // Suppress for empty legacy projects.
  const m = envelope.metrics;
  const hasSignal =
    m.allocated_hours > 0 ||
    m.planned_fee > 0 ||
    envelope.stageCoverages.some((s) => s.planned_hours > 0);
  if (!hasSignal) return null;

  const riskTone: Record<string, "default" | "secondary" | "destructive"> = {
    low: "secondary",
    medium: "default",
    high: "destructive",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {t("forecast.title")}
          <Badge variant={riskTone[m.capacity_risk_level]} className="text-[10px] font-normal">
            {t(`forecast.risk.${m.capacity_risk_level}`)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Metric
            label={t("forecast.metrics.forecastFee")}
            value={fmtEur(m.forecast_fee)}
          />
          <Metric
            label={t("forecast.metrics.forecastCost")}
            value={fmtEur(m.forecast_cost)}
          />
          <Metric
            label={t("forecast.metrics.forecastMargin")}
            value={fmtPct(m.forecast_margin_pct)}
            tone={
              m.forecast_margin_pct != null && m.forecast_margin_pct < 10
                ? "danger"
                : undefined
            }
          />
          <Metric
            label={t("forecast.metrics.staffingCoverage")}
            value={fmtPct(m.staffing_coverage_pct)}
            tone={m.staffing_coverage_pct < 80 ? "warning" : undefined}
          />
          <Metric
            label={t("forecast.metrics.allocatedHours")}
            value={fmtHrs(m.allocated_hours)}
          />
          <Metric
            label={t("forecast.metrics.remainingHours")}
            value={fmtHrs(m.remaining_hours)}
            tone={m.remaining_hours > 0 ? "warning" : undefined}
          />
          <Metric
            label={t("forecast.metrics.overloaded")}
            value={`${envelope.capacitySummary.overloaded} / ${envelope.capacitySummary.total}`}
            tone={envelope.capacitySummary.overloaded > 0 ? "danger" : undefined}
          />
          <Metric
            label={t("forecast.metrics.avgUtilization")}
            value={fmtPct(envelope.capacitySummary.avg_utilization_pct)}
          />
        </div>

        {envelope.stageCoverages.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              {t("forecast.stagesTitle")}
            </div>
            <div className="space-y-1.5">
              {envelope.stageCoverages.map((s) => {
                const over = s.over_allocated;
                return (
                  <div
                    key={s.project_stage_id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs"
                  >
                    <span className="font-mono text-[11px] truncate">
                      {s.project_stage_id.slice(0, 8)}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {fmtHrs(s.allocated_hours)} / {fmtHrs(s.planned_hours)}
                    </span>
                    <span
                      className={
                        over
                          ? "text-destructive font-medium"
                          : s.staffing_coverage_pct < 80
                          ? "text-amber-600 font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {over && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                      {fmtPct(s.staffing_coverage_pct)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={freeze.isPending}
            onClick={() => {
              freeze.mutate(
                { envelope },
                {
                  onSuccess: () => toast.success(t("forecast.snapshotFrozenToast")),
                  onError: (e: Error) => toast.error(e.message),
                },
              );
            }}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {t("forecast.freezeSnapshot")}
          </Button>
        </div>
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
  tone?: "danger" | "warning";
}) {
  const cls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
      ? "text-amber-600"
      : "";
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono text-sm ${cls}`}>{value}</div>
    </div>
  );
}
