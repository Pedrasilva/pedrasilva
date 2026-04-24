/**
 * Financial Summary tab — read-only rollup for the quote.
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
import { formatEUR } from "@/lib/crm/types";

export function QuoteFinancialSummaryTab({
  quoteId,
  pricingMultiplier,
}: {
  quoteId: string;
  pricingMultiplier: number;
}) {
  const { t } = useTranslation("crm");
  const allocsQ = useQuoteAllocations(quoteId);
  const extQ = useQuoteExternalServices(quoteId);

  const summary = rollupQuote({
    allocations: allocsQ.data ?? [],
    externalServices: extQ.data ?? [],
    pricingMultiplier,
  });

  const Cell = ({
    label,
    value,
    accent,
  }: { label: string; value: string; accent?: "good" | "bad" | "muted" }) => (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={
          accent === "good"
            ? "text-lg font-semibold text-emerald-600 dark:text-emerald-400"
            : accent === "bad"
              ? "text-lg font-semibold text-rose-600 dark:text-rose-400"
              : accent === "muted"
                ? "text-lg font-medium text-muted-foreground"
                : "text-lg font-semibold"
        }
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.financial.totalsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <Cell label={t("workspace.financial.totalCost")} value={formatEUR(summary.total.cost)} accent="muted" />
          <Cell label={t("workspace.financial.totalFee")} value={formatEUR(summary.totalFee)} />
          <Cell
            label={t("workspace.financial.totalProfit")}
            value={formatEUR(summary.total.profit)}
            accent={summary.total.profit >= 0 ? "good" : "bad"}
          />
          <Cell
            label={t("workspace.financial.effectiveMargin")}
            value={`${(summary.effectiveMargin * 100).toFixed(1)}%`}
            accent={summary.effectiveMargin >= 0 ? "good" : "bad"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.financial.internalTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <Cell label={t("workspace.financial.internalHours")} value={summary.internal.hours.toFixed(1)} accent="muted" />
          <Cell label={t("workspace.financial.internalCost")} value={formatEUR(summary.internal.cost)} accent="muted" />
          <Cell
            label={t("workspace.financial.internalFee")}
            value={formatEUR(summary.internal.value * summary.pricingMultiplier)}
          />
          <Cell
            label={t("workspace.financial.internalProfit")}
            value={formatEUR(
              summary.internal.value * summary.pricingMultiplier - summary.internal.cost,
            )}
            accent={
              summary.internal.value * summary.pricingMultiplier - summary.internal.cost >= 0
                ? "good"
                : "bad"
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.financial.externalTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <Cell label={t("workspace.financial.externalCost")} value={formatEUR(summary.external.cost)} accent="muted" />
          <Cell
            label={t("workspace.financial.externalFee")}
            value={formatEUR(summary.external.value * summary.pricingMultiplier)}
          />
          <Cell
            label={t("workspace.financial.externalProfit")}
            value={formatEUR(
              summary.external.value * summary.pricingMultiplier - summary.external.cost,
            )}
            accent={
              summary.external.value * summary.pricingMultiplier - summary.external.cost >= 0
                ? "good"
                : "bad"
            }
          />
          <Cell
            label={t("workspace.financial.pricingMultiplier")}
            value={`× ${summary.pricingMultiplier}`}
            accent="muted"
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("workspace.financial.disclaimer")}
      </p>
    </div>
  );
}
