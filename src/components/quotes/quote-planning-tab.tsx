/**
 * Quote Planning tab — unified planner.
 *
 * Single screen: Gantt with WBS outline + click-to-open inspector for editing
 * stage details, dependencies, and resources. Retainer-monthly stages get
 * their own dedicated editor below. The old consultants panel and the
 * Stages / Dependencies / Allocations in-tab tables have been folded into
 * the Gantt + Inspector.
 */
import {supabase} from "@/integrations/supabase/client";
import {useQueryClient} from "@tanstack/react-query";
import { useEffect, useMemo, useRef,useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { toast } from '@/lib/toast';
import { QuoteGantt } from "@/components/planner/planner-gantt";
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
import { useQuoteSupplierMarkups } from "@/lib/quotes/use-quote-supplier-markups";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
import { buildQuoteWarnings } from "@/lib/quotes/quote-warnings";
import { useQuoteLock } from "@/lib/quotes/use-quote-lock";

export function QuotePlanningTab({
  quoteId,
  pricingMultiplier = 1,
  isRetainer = false,
  canEditPlanning,
  canSeeFinancials = false,
}: {
  quoteId: string;
  pricingMultiplier?: number;
  isRetainer?: boolean;
  canEditPlanning?: boolean;
  canSeeFinancials?: boolean;
}) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const allocQ = useQuoteAllocations(quoteId);
  const externalQ = useQuoteExternalServices(quoteId);
  const markupsQ = useQuoteSupplierMarkups(quoteId);
  const upsertStage = useUpsertQuoteStage(quoteId);
  const lockQ = useQuoteLock(quoteId);
  const converted = !!lockQ.data?.projectId;
  const quoteReadOnly = !lockQ.isSuccess || !!lockQ.data?.isLocked || converted;

  const allStages = stagesQ.data ?? [];
  const allocations = allocQ.data ?? [];
  const externalServices = externalQ.data ?? [];
  const supplierMarkups = markupsQ.data ?? [];

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
      supplierMarkups,
    });
    return buildQuoteWarnings({
      stages,
      allocations,
      externalServices,
      summary,
    });
  }, [stages, allocations, externalServices, pricingMultiplier, supplierMarkups]);

  const qc=useQueryClient();
  const [retainerSaving,setRetainerSaving]=useState(false);
  const savingRef=useRef(false);
  const handleAddRetainerStage = async ():Promise<string|undefined> => {
    if (quoteReadOnly||savingRef.current) return;
    savingRef.current=true;setRetainerSaving(true);
    try {
      const {data,error}=await supabase.rpc('pm_retainer_create',{_mode:'quote',_scope:quoteId,_name:t('workspace.planning.retainerMonthly.defaultName'),_group_name:t('projects:proposalStagesManager.ui.obra'),_months:12,_amount:0});
      if(error)throw error;
      await Promise.all([qc.invalidateQueries({queryKey:['quote-stages',quoteId]}),qc.invalidateQueries({queryKey:['quote-dependencies',quoteId]}),qc.invalidateQueries({queryKey:['quote-payment-schedule',quoteId]})]);
      toast.success(
        t("workspace.planning.retainerMonthly.created", {
          defaultValue: "Retainer phase added",
        }),
      );
      return data;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {savingRef.current=false;setRetainerSaving(false);}
  };

  // Auto-seed a retainer stage for retainer-type quotes.
  const seededRetainerRef = useRef(false);
  useEffect(() => {
    if (!isRetainer || quoteReadOnly) return;
    if (!stagesQ.isSuccess) return;
    if (seededRetainerRef.current) return;
    if (retainerStages.length > 0) return;
    seededRetainerRef.current = true;
    handleAddRetainerStage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetainer, stagesQ.isSuccess, retainerStages.length, quoteReadOnly]);

  return (
    <div className="space-y-2">
      {!isRetainer && <QuoteWarningsBanner warnings={warnings} />}

      {(
        <QuoteGantt quoteId={quoteId} onAddRetainerPhase={handleAddRetainerStage} retainerSaving={retainerSaving}
          canEditPlanning={canEditPlanning} canSeeFinancials={canSeeFinancials} />
      )}

      {retainerStages.length > 0 && (
        <div className="space-y-2">
          {retainerStages.map((s) => (
            <RetainerStageEditor
              key={s.id}
              quoteId={quoteId}
              stage={s}
              allocations={allocations}
              readOnly={quoteReadOnly}
            />
          ))}
        </div>
      )}

      {isRetainer && !converted && retainerStages.length === 0 && (
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
              disabled={quoteReadOnly || upsertStage.isPending || stagesQ.isLoading}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("workspace.planning.retainerMonthly.createTemplate", {
                defaultValue: "Create monthly template",
              })}
            </Button>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
