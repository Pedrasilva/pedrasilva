/**
 * Financial Summary tab — read-only rollup for the quote.
 *
 * Visual hierarchy (Phase E):
 *   - Headline strip: Total Fee (large, primary) | Total Cost (muted) |
 *     Profit (semantic colour) | Margin (large, semantic colour with band).
 *   - Internal vs External cards underneath, clearly separated, with
 *     hours/cost/fee/profit per side.
 *   - Lightweight warnings (negative margin, missing team, etc.) shown at
 *     the top via QuoteWarningsBanner.
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
import { buildQuoteWarnings, marginBand } from "@/lib/quotes/quote-warnings";
import { QuoteWarningsBanner } from "@/components/quotes/quote-warnings-banner";
import { formatEUR } from "@/lib/crm/types";

type Accent = "good" | "bad" | "warn" | "muted" | "primary";

const accentClass: Record<Accent, string> = {
  primary: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-rose-600 dark:text-rose-400",
  muted: "text-muted-foreground",
};

function HeadlineStat({
  label,
  value,
  accent = "primary",
  emphasis = "default",
}: {
  label: string;
  value: string;
  accent?: Accent;
  emphasis?: "default" | "hero";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-semibold ${accentClass[accent]} ${
          emphasis === "hero" ? "text-3xl" : "text-2xl"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Cell({
  label,
  value,
  accent = "primary",
}: {
  label: string;
  value: string;
  accent?: Accent;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`text-lg font-semibold ${accentClass[accent]}`}>
        {value}
      </span>
    </div>
  );
}

export function QuoteFinancialSummaryTab({
  quoteId,
  pricingMultiplier,
}: {
  quoteId: string;
  pricingMultiplier: number;
}) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const allocsQ = useQuoteAllocations(quoteId);
  const extQ = useQuoteExternalServices(quoteId);

  const allocations = allocsQ.data ?? [];
  const externalServices = extQ.data ?? [];
  const stages = stagesQ.data ?? [];

  const summary = rollupQuote({
    allocations,
    externalServices,
    pricingMultiplier,
  });

  const band = marginBand(summary.effectiveMargin);
  const marginAccent: Accent = band === "good" ? "good" : band === "warn" ? "warn" : "bad";
  const profitAccent: Accent =
    summary.total.profit > 0 ? "good" : summary.total.profit < 0 ? "bad" : "warn";

  const warnings = buildQuoteWarnings({
    stages,
    allocations,
    externalServices,
    summary,
  });

  const internalProfit =
    summary.internal.value * summary.pricingMultiplier - summary.internal.cost;
  const externalProfit =
    summary.external.value * summary.pricingMultiplier - summary.external.cost;

  return (
    <div className="space-y-6">
      <QuoteWarningsBanner warnings={warnings} />

      {/* HEADLINE — Total Fee, Total Cost, Profit, Margin */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.financial.totalsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <HeadlineStat
            label={t("workspace.financial.totalFee")}
            value={formatEUR(summary.totalFee)}
            accent="primary"
            emphasis="hero"
          />
          <HeadlineStat
            label={t("workspace.financial.totalCost")}
            value={formatEUR(summary.total.cost)}
            accent="muted"
          />
          <HeadlineStat
            label={t("workspace.financial.totalProfit")}
            value={formatEUR(summary.total.profit)}
            accent={profitAccent}
          />
          <HeadlineStat
            label={t("workspace.financial.effectiveMargin")}
            value={`${(summary.effectiveMargin * 100).toFixed(1)}%`}
            accent={marginAccent}
            emphasis="hero"
          />
        </CardContent>
      </Card>

      {/* SPLIT — Internal vs External, side-by-side on md+ */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("workspace.financial.internalTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Cell
              label={t("workspace.financial.internalHours")}
              value={summary.internal.hours.toFixed(1)}
              accent="muted"
            />
            <Cell
              label={t("workspace.financial.internalCost")}
              value={formatEUR(summary.internal.cost)}
              accent="muted"
            />
            <Cell
              label={t("workspace.financial.internalFee")}
              value={formatEUR(summary.internal.value * summary.pricingMultiplier)}
            />
            <Cell
              label={t("workspace.financial.internalProfit")}
              value={formatEUR(internalProfit)}
              accent={internalProfit >= 0 ? "good" : "bad"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("workspace.financial.externalTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Cell
              label={t("workspace.financial.externalCost")}
              value={formatEUR(summary.external.cost)}
              accent="muted"
            />
            <Cell
              label={t("workspace.financial.externalFee")}
              value={formatEUR(summary.external.value * summary.pricingMultiplier)}
            />
            <Cell
              label={t("workspace.financial.externalProfit")}
              value={formatEUR(externalProfit)}
              accent={externalProfit >= 0 ? "good" : "bad"}
            />
            <Cell
              label={t("workspace.financial.pricingMultiplier")}
              value={`× ${summary.pricingMultiplier}`}
              accent="muted"
            />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("workspace.financial.disclaimer")}
      </p>
    </div>
  );
}
