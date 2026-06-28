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
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuoteAllocations, type QuoteAllocationWithResource } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { rollupQuote, quoteAllocationLine } from "@/lib/quotes/financial-rollups";
import { buildQuoteWarnings, marginBand } from "@/lib/quotes/quote-warnings";
import { QuoteWarningsBanner } from "@/components/quotes/quote-warnings-banner";
import { formatEUR, normalizeQuoteCategory } from "@/lib/crm/types";
import { parseTimeBasedSettings } from "@/lib/quotes/time-based-settings";
import type { QuoteStage } from "@/lib/quotes/types";

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
  const qc = useQueryClient();
  const stagesQ = useQuoteStages(quoteId);
  const allocsQ = useQuoteAllocations(quoteId);
  const extQ = useQuoteExternalServices(quoteId);

  // Fetch quote-level fields needed for the time-based / retainer rollup
  // (so the summary is no longer empty for those workflows).
  const { data: quoteRow } = useQuery({
    queryKey: ["fee_proposal_for_financial_summary", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("quote_category, quote_type, time_based_settings")
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as {
        quote_category: string | null;
        quote_type: string | null;
        time_based_settings: unknown;
      };
    },
  });

  // Average sale rate from active HR resources — used to translate fixed-fee
  // architecture stages into an "implied man-hours" figure so the financial
  // summary tells both the money and the effort story.
  const { data: avgSaleRate = 0 } = useQuery({
    queryKey: ["pm-resources-avg-sale-rate"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_resources")
        .select("hourly_rate, sale_rate")
        .eq("active", true);
      if (error) throw error;
      const rates = (data ?? [])
        .map((r: { hourly_rate: number | null; sale_rate: number | null }) =>
          Number(r.sale_rate ?? r.hourly_rate ?? 0),
        )
        .filter((n) => n > 0);
      if (rates.length === 0) return 0;
      return rates.reduce((s, n) => s + n, 0) / rates.length;
    },
  });

  const allocations = allocsQ.data ?? [];
  const externalServices = extQ.data ?? [];
  const stages = stagesQ.data ?? [];

  // Local draft of the multiplier so the user can type freely (e.g. "1.")
  // without losing focus or forcing a mutation per keystroke. We persist on
  // explicit Save click or blur — see saveMultiplier below.
  const [multiplierDraft, setMultiplierDraft] = useState<string>(
    String(pricingMultiplier ?? 1),
  );
  useEffect(() => {
    setMultiplierDraft(String(pricingMultiplier ?? 1));
  }, [pricingMultiplier]);

  const persistMultiplier = useMutation({
    mutationFn: async (next: number) => {
      const { error } = await supabase
        .from("fee_proposals")
        .update({ pricing_multiplier: next })
        .eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("workspace.financial.multiplierSaved"));
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Apply the typed value optimistically to the rollup so KPIs update live,
  // even before the mutation lands. Falls back to the prop on invalid input.
  const draftNum = Number(multiplierDraft);
  const liveMultiplier = Number.isFinite(draftNum) && draftNum > 0
    ? draftNum
    : pricingMultiplier;

  const category = quoteRow ? normalizeQuoteCategory(quoteRow.quote_category) : "project";
  const timeBasedSettings = quoteRow
    ? parseTimeBasedSettings(quoteRow.time_based_settings, quoteRow.quote_type)
    : null;

  const summary = rollupQuote({
    allocations,
    externalServices,
    pricingMultiplier: liveMultiplier,
    category,
    timeBasedSettings,
  });

  const band = marginBand(summary.effectiveMargin);
  const marginAccent: Accent = band === "good" ? "good" : band === "warn" ? "warn" : "bad";
  const profitAccent: Accent =
    summary.total.profit > 0 ? "good" : summary.total.profit < 0 ? "bad" : "warn";

  // Markup on cost = profit / cost. Different from margin (profit / fee).
  // Useful for designers who think in “add X% on top of cost”.
  const markupOnCost =
    summary.total.cost > 0 ? summary.total.profit / summary.total.cost : 0;
  const markupAccent: Accent =
    markupOnCost > 0 ? "good" : markupOnCost < 0 ? "bad" : "warn";

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

      {/* HEADLINE — Total Fee, Total Cost, Profit, Margin, Markup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.financial.totalsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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
          <HeadlineStat
            label={t("workspace.financial.markupOnCost")}
            value={`${(markupOnCost * 100).toFixed(1)}%`}
            accent={markupAccent}
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
          </CardContent>
        </Card>
      </div>

      {/* ARCHITECTURE STAGES — fee + estimated man-hours per stage.
          For resource-based stages we show actual planned hours from
          allocations; for fixed-fee stages we show implied hours derived
          from the average HR sale rate. Suppliers are excluded. */}
      <ArchitectureStagesCard
        stages={stages}
        allocations={allocations}
        avgSaleRate={avgSaleRate}
      />



      {/* PRICING CONTROL — editable multiplier, persists to fee_proposals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.financial.pricingMultiplier")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Label htmlFor="quote-multiplier" className="text-xs">
                ×
              </Label>
              <Input
                id="quote-multiplier"
                type="number"
                step="0.01"
                min="0"
                value={multiplierDraft}
                onChange={(e) => setMultiplierDraft(e.target.value)}
                onBlur={() => {
                  const n = Number(multiplierDraft);
                  if (Number.isFinite(n) && n > 0 && n !== pricingMultiplier) {
                    persistMultiplier.mutate(n);
                  }
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={
                persistMultiplier.isPending ||
                !Number.isFinite(Number(multiplierDraft)) ||
                Number(multiplierDraft) <= 0 ||
                Number(multiplierDraft) === pricingMultiplier
              }
              onClick={() => persistMultiplier.mutate(Number(multiplierDraft))}
            >
              {t("workspace.financial.saveMultiplier")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("workspace.financial.pricingMultiplierHint")}
            </p>
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              <span className="font-medium text-foreground">
                {t("workspace.financial.effectiveMargin")}:
              </span>{" "}
              {t("workspace.financial.marginHint")}
            </p>
            <p>
              <span className="font-medium text-foreground">
                {t("workspace.financial.markupOnCost")}:
              </span>{" "}
              {t("workspace.financial.markupHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("workspace.financial.disclaimer")}
      </p>
    </div>
  );
}
