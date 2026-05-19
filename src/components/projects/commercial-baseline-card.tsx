/**
 * Stage 6B — Commercial baseline overview card.
 *
 * Read-only summary of the sealed commercial baseline inherited from the
 * signed contract via the project bootstrap pipeline. Renders nothing for
 * legacy projects without a baseline row.
 */
import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useProjectCommercialBaseline,
  useStageCommercialBaselines,
  useStageAllocationPlaceholders,
} from "@/lib/project-bootstrap";

function fmtEur(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(v));
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(Number(v))}%`;
}

function fmtNum(v: number | null | undefined, suffix = "") {
  if (v == null) return "—";
  return `${Math.round(Number(v) * 10) / 10}${suffix}`;
}

export function CommercialBaselineCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation("crm");
  const baselineQ = useProjectCommercialBaseline(projectId);
  const stageQ = useStageCommercialBaselines(projectId);
  const phQ = useStageAllocationPlaceholders(projectId);

  const baseline = baselineQ.data;
  if (!baseline) return null; // legacy projects: no row → render nothing.

  const stages = stageQ.data ?? [];
  const placeholders = phQ.data ?? [];
  const totalPlaceholderHours = placeholders.reduce(
    (acc, p) => acc + (Number(p.expected_hours) || 0),
    0,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          {t("contracts.bootstrap.baseline.title")}
          <Badge variant="outline" className="text-[10px] font-normal">
            {t("contracts.bootstrap.baseline.sealed")}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Project baseline */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Metric
            label={t("contracts.bootstrap.baseline.soldFee")}
            value={fmtEur(baseline.sold_fee_total)}
          />
          <Metric
            label={t("contracts.bootstrap.baseline.plannedDuration")}
            value={fmtNum(baseline.planned_duration_weeks, " w")}
          />
          <Metric
            label={t("contracts.bootstrap.baseline.targetRecoverability")}
            value={fmtPct(baseline.target_recoverability_pct)}
          />
          <Metric
            label={t("contracts.bootstrap.baseline.targetMargin")}
            value={fmtPct(baseline.target_gross_margin_pct)}
          />
          <Metric
            label={t("contracts.bootstrap.baseline.internalFee")}
            value={fmtEur(baseline.sold_internal_fee)}
          />
          <Metric
            label={t("contracts.bootstrap.baseline.externalFee")}
            value={fmtEur(baseline.sold_external_fee)}
          />
          <Metric
            label={t("contracts.bootstrap.baseline.targetChargeability")}
            value={fmtPct(baseline.target_chargeability_pct)}
          />
          <Metric
            label={t("contracts.bootstrap.baseline.constructionMonths")}
            value={fmtNum(baseline.planned_construction_months, " m")}
          />
        </div>

        {/* Stages */}
        {stages.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {t("contracts.bootstrap.baseline.stagesTitle")}
            </div>
            <div className="space-y-1.5">
              {stages
                .slice()
                .sort((a, b) =>
                  (a.source_contract_phase_key ?? "").localeCompare(
                    b.source_contract_phase_key ?? "",
                  ),
                )
                .map((s) => (
                  <div
                    key={s.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-xs"
                  >
                    <span className="truncate font-mono text-[11px]">
                      {s.source_contract_phase_key ?? "—"}
                    </span>
                    {s.phase_class && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`contracts.bootstrap.baseline.phaseClass.${s.phase_class}`, {
                          defaultValue: s.phase_class,
                        })}
                      </Badge>
                    )}
                    <span className="font-mono text-muted-foreground">
                      {fmtNum(s.estimated_hours, " h")}
                    </span>
                    <span className="font-mono">{fmtEur(s.sold_fee)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Placeholder envelope summary */}
        {placeholders.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {t("contracts.bootstrap.baseline.placeholdersBadge")}
            </Badge>
            <span>
              {t("contracts.bootstrap.baseline.placeholdersSummary", {
                count: placeholders.length,
                hours: Math.round(totalPlaceholderHours),
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
