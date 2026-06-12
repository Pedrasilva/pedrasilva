/**
 * Quote Planning tab — unified planner.
 *
 * Single screen: Gantt with WBS outline + click-to-open inspector for editing
 * stage details, dependencies, and resources. Retainer-monthly stages get
 * their own dedicated editor above. The old consultants panel and the
 * Stages / Dependencies / Allocations in-tab tables have been folded into
 * the Gantt + Inspector.
 */
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { QuoteGantt } from "@/components/quotes/quote-gantt";
import { RetainerStageEditor } from "@/components/quotes/retainer-stage-editor";
import { QuoteWarningsBanner } from "@/components/quotes/quote-warnings-banner";
import {
  DEFAULT_RETAINER_CAPACITY_HPM,
  defaultAnchorMonth,
  anchorMonthStart,
  anchorMonthEnd,
} from "@/lib/quotes/retainer-monthly";
import { useQuoteStages, useUpsertQuoteStage } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
import { buildQuoteWarnings } from "@/lib/quotes/quote-warnings";

export function QuotePlanningTab({
  quoteId,
  pricingMultiplier = 1,
  isRetainer = false,
}: {
  quoteId: string;
  pricingMultiplier?: number;
  isRetainer?: boolean;
}) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const allocQ = useQuoteAllocations(quoteId);
  const externalQ = useQuoteExternalServices(quoteId);
  const upsertStage = useUpsertQuoteStage(quoteId);

  const allStages = stagesQ.data ?? [];
  const allocations = allocQ.data ?? [];
  const externalServices = externalQ.data ?? [];

  const retainerStages = useMemo(
    () => allStages.filter((s) => (s as { stage_kind?: string }).stage_kind === "retainer_monthly"),
    [allStages],
  );
  const stages = useMemo(
    () => allStages.filter((s) => (s as { stage_kind?: string }).stage_kind !== "retainer_monthly"),
    [allStages],
  );

  const warnings = useMemo(() => {
    const summary = rollupQuote({
      allocations,
      externalServices,
      pricingMultiplier,
    });
    return buildQuoteWarnings({
      stages,
      allocations,
      externalServices,
      summary,
    });
  }, [stages, allocations, externalServices, pricingMultiplier]);

  const handleAddRetainerStage = async () => {
    const anchor = defaultAnchorMonth();
    try {
      await upsertStage.mutateAsync({
        quote_id: quoteId,
        name: t("workspace.planning.retainerMonthly.defaultName", {
          defaultValue: "Construction retainer",
        }),
        start_date: anchorMonthStart(anchor),
        end_date: anchorMonthEnd(anchor),
        budget: 0,
        sort_order: allStages.length,
        stage_kind: "retainer_monthly",
        billing_model: "retainer",
        retainer_anchor_month: anchor,
        retainer_months: 12,
        retainer_capacity_hours_per_month: DEFAULT_RETAINER_CAPACITY_HPM,
      } as Parameters<typeof upsertStage.mutateAsync>[0]);
      toast.success(
        t("workspace.planning.retainerMonthly.created", {
          defaultValue: "Retainer phase added",
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Auto-seed a retainer stage for retainer-type quotes.
  const seededRetainerRef = useRef(false);
  useEffect(() => {
    if (!isRetainer) return;
    if (!stagesQ.isSuccess) return;
    if (seededRetainerRef.current) return;
    if (retainerStages.length > 0) return;
    seededRetainerRef.current = true;
    handleAddRetainerStage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetainer, stagesQ.isSuccess, retainerStages.length]);

  return (
    <div className="space-y-6">
      {!isRetainer && (
        <>
          <QuoteWarningsBanner warnings={warnings} />
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("workspace.planning.feeDriverHint", {
              defaultValue: "Your fee is driven by team time and external services.",
            })}
          </div>
        </>
      )}

      {retainerStages.length > 0 && (
        <div className="space-y-3">
          {retainerStages.map((s) => (
            <RetainerStageEditor
              key={s.id}
              quoteId={quoteId}
              stage={s}
              allocations={allocations}
            />
          ))}
        </div>
      )}

      {isRetainer && retainerStages.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("workspace.planning.retainerMonthly.emptyTitle", {
                defaultValue: "Monthly retainer template",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("workspace.planning.retainerMonthly.emptyHint", {
                defaultValue:
                  "Create the monthly fee template used for recurring retainer billing.",
              })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRetainerStage}
              disabled={upsertStage.isPending || stagesQ.isLoading}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("workspace.planning.retainerMonthly.createTemplate", {
                defaultValue: "Create monthly template",
              })}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isRetainer && (
        <>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleAddRetainerStage}>
              <Plus className="h-4 w-4 mr-1" />
              {t("workspace.planning.retainerMonthly.addStage", {
                defaultValue: "Add retainer phase",
              })}
            </Button>
          </div>

          {/* Single planning surface: Gantt outline + inspector drawer.
              Replaces consultants panel and stages/deps/allocations tables. */}
          <QuoteGantt quoteId={quoteId} />
        </>
      )}
    </div>
  );
}
