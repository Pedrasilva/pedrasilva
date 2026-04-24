/**
 * Lightweight, non-blocking validation warnings for the quote workspace.
 *
 * Pure helpers — no React Query, no Supabase. The Planning and Financial
 * Summary tabs feed in their already-fetched data and render whichever
 * warnings come back. Each warning carries a stable `id` (used as i18n key)
 * and a `severity` so the UI can pick the right colour.
 *
 * Severity scale (matches the visual treatment in QuoteWarningsBanner):
 *   - "info"   → neutral hint (blue / muted)
 *   - "warn"   → amber, attention needed but not blocking
 *   - "danger" → red, financially harmful (negative profit, etc.)
 */
import type { QuoteAllocationWithResource } from "./use-quote-allocations";
import type { QuoteExternalServiceWithSupplier } from "./use-quote-external-services";
import type { QuoteStage } from "./types";
import type { QuoteFinancialSummary } from "./financial-rollups";

export type QuoteWarningSeverity = "info" | "warn" | "danger";

export interface QuoteWarning {
  /** Stable id, used as the i18n key suffix (workspace.warnings.<id>). */
  id:
    | "stageWithoutAllocation"
    | "noTeam"
    | "negativeProfit"
    | "zeroProfit"
    | "externalNoSupplier"
    | "noStages";
  severity: QuoteWarningSeverity;
  /** Optional context substituted into the translated message. */
  values?: Record<string, string | number>;
}

export function buildQuoteWarnings({
  stages,
  allocations,
  externalServices,
  summary,
}: {
  stages: QuoteStage[];
  allocations: QuoteAllocationWithResource[];
  externalServices: QuoteExternalServiceWithSupplier[];
  summary: QuoteFinancialSummary;
}): QuoteWarning[] {
  const out: QuoteWarning[] = [];

  if (stages.length === 0) {
    out.push({ id: "noStages", severity: "warn" });
    // Without stages the rest of the checks are noise.
    return out;
  }

  // No allocations on the entire quote → no team is planned.
  if (allocations.length === 0) {
    out.push({ id: "noTeam", severity: "warn" });
  } else {
    // Per-stage check — list stages with zero allocations.
    const stagesWithAllocs = new Set(allocations.map((a) => a.stage_id));
    const orphanStages = stages.filter((s) => !stagesWithAllocs.has(s.id));
    if (orphanStages.length > 0) {
      out.push({
        id: "stageWithoutAllocation",
        severity: "info",
        values: {
          count: orphanStages.length,
          names: orphanStages
            .slice(0, 3)
            .map((s) => s.name)
            .join(", ") + (orphanStages.length > 3 ? "…" : ""),
        },
      });
    }
  }

  // External services missing a supplier reference.
  const orphanServices = externalServices.filter(
    (s) => !s.supplier_id && !s.supplier?.name,
  );
  if (orphanServices.length > 0) {
    out.push({
      id: "externalNoSupplier",
      severity: "info",
      values: { count: orphanServices.length },
    });
  }

  // Profit signal — only meaningful once we have either fee or cost > 0.
  if (summary.totalFee > 0 || summary.total.cost > 0) {
    if (summary.total.profit < 0) {
      out.push({ id: "negativeProfit", severity: "danger" });
    } else if (summary.total.profit === 0 && summary.totalFee > 0) {
      out.push({ id: "zeroProfit", severity: "warn" });
    }
  }

  return out;
}

/**
 * Margin band thresholds. Tuned for architecture/engineering practice — a
 * 25%+ margin is considered healthy, anything between 10% and 25% is amber,
 * and below 10% (including negative) is red.
 *
 * Returned `band` maps to a colour decision in the UI; the underlying numeric
 * thresholds are kept in one place so they stay consistent across charts,
 * banners, and KPI tiles.
 */
export type MarginBand = "good" | "warn" | "bad";

export function marginBand(marginRatio: number): MarginBand {
  if (!Number.isFinite(marginRatio)) return "warn";
  if (marginRatio < 0.1) return "bad";
  if (marginRatio < 0.25) return "warn";
  return "good";
}
