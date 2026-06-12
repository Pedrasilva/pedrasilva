/**
 * Quote Planning tab — stages + dependencies + allocations.
 * No Gantt yet (Phase C). Plain tables only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { QuoteGantt } from "@/components/quotes/quote-gantt";
import { QuoteConsultantsPanel } from "@/components/quotes/quote-consultants-panel";
import { RetainerStageEditor } from "@/components/quotes/retainer-stage-editor";
import { QuoteWarningsBanner } from "@/components/quotes/quote-warnings-banner";
import {
  DEFAULT_RETAINER_CAPACITY_HPM,
  defaultAnchorMonth,
  anchorMonthStart,
  anchorMonthEnd,
} from "@/lib/quotes/retainer-monthly";
import {
  useQuoteStages, useUpsertQuoteStage, useDeleteQuoteStage,
} from "@/lib/quotes/use-quote-stages";
import {
  useQuoteAllocations, useUpsertQuoteAllocation, useDeleteQuoteAllocation,
} from "@/lib/quotes/use-quote-allocations";
import {
  useQuoteDependencies, useCreateQuoteDependency, useDeleteQuoteDependency,
} from "@/lib/quotes/use-quote-dependencies";
import { useUpdateQuoteDependency } from "@/lib/quotes/use-quote-planner";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import {
  useDefaultResourceRates, effectiveRates,
} from "@/lib/projects/use-default-rates";
import { useQuotePlanningPool } from "@/lib/quotes/use-quote-planning-pool";
import { QUOTE_DEP_TYPES, type QuoteDepType } from "@/lib/quotes/types";
import { rollupQuote, quoteAllocationLine } from "@/lib/quotes/financial-rollups";
import { buildQuoteWarnings } from "@/lib/quotes/quote-warnings";
import { formatEUR } from "@/lib/crm/types";
import { useProposalRoles } from "@/lib/proposal-roles";


const PCT_PRESETS = [100, 80, 50, 20, 10] as const;
const pctToHpd = (pct: number) => Math.max(0, Math.min(24, (pct / 100) * 8));

const today = () => new Date().toISOString().slice(0, 10);

export function QuotePlanningTab({
  quoteId,
  pricingMultiplier = 1,
  isRetainer = false,
}: {
  quoteId: string;
  pricingMultiplier?: number;
  isRetainer?: boolean;
}) {
  const { t, i18n } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const depsQ = useQuoteDependencies(quoteId);
  const allocQ = useQuoteAllocations(quoteId);
  const externalQ = useQuoteExternalServices(quoteId);
  const upsertStage = useUpsertQuoteStage(quoteId);
  const delStage = useDeleteQuoteStage(quoteId);
  const createDep = useCreateQuoteDependency(quoteId);
  const delDep = useDeleteQuoteDependency(quoteId);
  const updateDep = useUpdateQuoteDependency(quoteId);
  const upsertAlloc = useUpsertQuoteAllocation(quoteId);
  const delAlloc = useDeleteQuoteAllocation(quoteId);

  const allStages = stagesQ.data ?? [];
  const deps = depsQ.data ?? [];
  const allocations = allocQ.data ?? [];
  const externalServices = externalQ.data ?? [];

  // Split stages by kind. Retainer-monthly stages are rendered above with a
  // dedicated editor; the regular Gantt + tables only deal with `regular`.
  const retainerStages = useMemo(
    () => allStages.filter((s) => (s as { stage_kind?: string }).stage_kind === "retainer_monthly"),
    [allStages],
  );
  const stages = useMemo(
    () => allStages.filter((s) => (s as { stage_kind?: string }).stage_kind !== "retainer_monthly"),
    [allStages],
  );

  // Selectable team pool for the manual allocation dropdown — same filter
  // as the Gantt resource pool (active + collaborator.include_in_planning +
  // collaborator.archived_at IS NULL).
  const { poolResources: resources } = useQuotePlanningPool();
  const { data: defaults } = useDefaultResourceRates();
  const { data: proposalRoles = [] } = useProposalRoles();
  const isPt = (i18n.language ?? "").startsWith("pt");
  const roleLabel = useMemo(() => {
    const byCode: Record<string, string> = {};
    for (const r of proposalRoles) {
      byCode[r.code] = isPt ? r.label_pt : r.label_en;
    }
    return (code: string | null | undefined): string => {
      if (!code) return isPt ? "Sem título" : "Untitled";
      return byCode[code] ?? code;
    };
  }, [proposalRoles, isPt]);

  const stageMap = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s])),
    [stages],
  );

  // Per-stage rollup: hours / cost / fee derived from allocations.
  // Uses raw snapshot rates (no pricingMultiplier) so the Sale (Gantt) column
  // matches the resource box in the Gantt exactly — single source of truth.
  const stageRollups = useMemo(() => {
    const m = new Map<string, { hours: number; cost: number; fee: number }>();
    for (const a of allocations) {
      const line = quoteAllocationLine(a);
      const cur = m.get(a.stage_id) ?? { hours: 0, cost: 0, fee: 0 };
      cur.hours += line.hours;
      cur.cost += line.cost;
      cur.fee += line.revenue;
      m.set(a.stage_id, cur);
    }
    return m;
  }, [allocations]);

  // Lightweight, non-blocking warnings driven by the same rollup as the
  // financial summary so users get consistent signals across tabs.
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

  // ---- Stage row state -------------------------------------------------
  const [newStage, setNewStage] = useState({
    name: "",
    start_date: today(),
    end_date: today(),
    budget: "",
  });

  // Sale & margin are derived exclusively from the Gantt allocations
  // (single source of truth). No table-level override.


  const handleAddStage = async () => {
    if (!newStage.name.trim()) return toast.error(t("workspace.planning.errorStageName"));
    if (newStage.end_date < newStage.start_date)
      return toast.error(t("workspace.planning.errorStageDates"));
    try {
      await upsertStage.mutateAsync({
        quote_id: quoteId,
        name: newStage.name.trim(),
        start_date: newStage.start_date,
        end_date: newStage.end_date,
        budget: newStage.budget ? Number(newStage.budget) : 0,
        sort_order: stages.length,
      });
      setNewStage({ name: "", start_date: today(), end_date: today(), budget: "" });
      toast.success(t("workspace.planning.stageCreated"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ---- Dependency state ------------------------------------------------
  const [newDep, setNewDep] = useState<{
    pred: string; succ: string; type: QuoteDepType; lag: string;
  }>({ pred: "", succ: "", type: "FS", lag: "0" });

  const handleAddDep = async () => {
    if (!newDep.pred || !newDep.succ || newDep.pred === newDep.succ)
      return toast.error(t("workspace.planning.errorDepStages"));
    try {
      await createDep.mutateAsync({
        quote_id: quoteId,
        predecessor_stage_id: newDep.pred,
        successor_stage_id: newDep.succ,
        type: newDep.type,
        lag_days: Number(newDep.lag) || 0,
      });
      setNewDep({ pred: "", succ: "", type: "FS", lag: "0" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ---- Allocation state ------------------------------------------------
  const [newAlloc, setNewAlloc] = useState({
    resource_id: "",
    stage_id: "",
    start_date: today(),
    end_date: today(),
    pct: "100",
    hpd: "8",
  });

  const handleAddAlloc = async () => {
    if (!newAlloc.resource_id || !newAlloc.stage_id)
      return toast.error(t("workspace.planning.errorAllocResStage"));
    if (newAlloc.end_date < newAlloc.start_date)
      return toast.error(t("workspace.planning.errorStageDates"));
    const res = resources.find((r) => r.id === newAlloc.resource_id);
    if (!res) return;
    const rates = effectiveRates(res, defaults);
    try {
      await upsertAlloc.mutateAsync({
        quote_id: quoteId,
        resource_id: newAlloc.resource_id,
        stage_id: newAlloc.stage_id,
        start_date: newAlloc.start_date,
        end_date: newAlloc.end_date,
        hours_per_day: Number(newAlloc.hpd) || 8,
        allocation_percentage: Number(newAlloc.pct) || 100,
        cost_rate_snapshot: rates.cost,
        sale_rate_snapshot: rates.sale,
      });
      setNewAlloc((p) => ({ ...p, resource_id: "", stage_id: "" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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
        // New retainer-as-monthly-template model.
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

  // Auto-seed a retainer stage for retainer-type quotes so the monthly
  // editor renders immediately (instead of an empty "no stages" state).
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
          {/* Non-blocking warnings (no team, negative profit, missing supplier…) */}
          <QuoteWarningsBanner warnings={warnings} />

          {/* Fee-driver hint — clarifies what shapes the headline number */}
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("workspace.planning.feeDriverHint", {
              defaultValue: "Your fee is driven by team time and external services.",
            })}
          </div>
        </>
      )}

      {/* RETAINER-MONTHLY STAGES — 1-month allocation templates that repeat.
          Rendered above the regular Gantt; intentionally NOT on the Gantt
          (would render as a misleading one-month bar). */}
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

          {/* GANTT — single planning surface (stages + inline inspector for
              dependencies & resources). Replaces the old consultants panel
              and the three in-tab tables (stages / deps / allocations). */}
          <QuoteGantt quoteId={quoteId} />
        </>
      )}

    </div>
  );
}

