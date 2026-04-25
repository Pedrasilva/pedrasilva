/**
 * Quote-mode planner adapter — same contract as the project adapter, but
 * wired to quote_* tables. Hides project-only features (baseline / leave /
 * overload / status toggle / cross-project move / holiday shading) via
 * QUOTE_FEATURES, so the same GanttChart renders a clean planning surface
 * for fee proposals.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useQuoteDependencies,
  useCreateQuoteDependency,
  useDeleteQuoteDependency,
} from "@/lib/quotes/use-quote-dependencies";
import {
  useUpsertQuoteAllocation,
  useDeleteQuoteAllocation,
} from "@/lib/quotes/use-quote-allocations";
import { useUpsertQuoteStage, useDeleteQuoteStage } from "@/lib/quotes/use-quote-stages";
import {
  useUpdateQuoteDependency,
  useUpdateQuoteStageWithCascade,
} from "@/lib/quotes/use-quote-planner";
import type { Resource } from "@/lib/projects/types";
import type { StageDependency, DepType } from "@/lib/projects/dependencies";
import { QUOTE_FEATURES, type PlannerAdapter } from "@/lib/projects/planner-adapter";
import { useDefaultResourceRates, effectiveRates } from "@/lib/projects/use-default-rates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useQuotePlannerAdapter(
  quoteId: string,
  resources: Resource[],
): PlannerAdapter {
  const { t } = useTranslation(["projects"]);
  const qc = useQueryClient();
  const depsQ = useQuoteDependencies(quoteId);
  const upsertStage = useUpsertQuoteStage(quoteId);
  const deleteStage = useDeleteQuoteStage(quoteId);
  const upsertAlloc = useUpsertQuoteAllocation(quoteId);
  const deleteAlloc = useDeleteQuoteAllocation(quoteId);
  const createDep = useCreateQuoteDependency(quoteId);
  const updateDep = useUpdateQuoteDependency(quoteId);
  const deleteDep = useDeleteQuoteDependency(quoteId);
  const updateStageCascade = useUpdateQuoteStageWithCascade(quoteId);
  // HR-derived default rates: covers the common case where pm_resources rows
  // have cost_rate / sale_rate / hourly_rate all 0 (rates live in the HR
  // pricing model, not on pm_resources). Without these, every dragged
  // allocation snapshots €0/h and stage rollups are stuck at €0.
  const { data: defaults } = useDefaultResourceRates();

  // Snapshot rates: prefer the resource's manual rate when > 0, otherwise
  // fall back to the HR-computed default for that resource.
  function snapshotRates(resourceId: string): { cost: number; sale: number } {
    const r = resources.find((x) => x.id === resourceId);
    if (!r) return { cost: 0, sale: 0 };
    return effectiveRates(
      { id: r.id, hourly_rate: r.hourly_rate ?? r.sale_rate, cost_rate: r.cost_rate },
      defaults,
    );
  }

  // Quote allocation drag/move uses an upsert, so we need a tiny wrapper that
  // looks up the existing row to merge fields the Gantt patch may omit.
  const updateAllocMut = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        start_date?: string;
        end_date?: string;
        hours_per_day?: number;
        stage_id?: string;
        allocation_percentage?: number | null;
      };
    }) => {
      const { data, error } = await db
        .from("quote_allocations")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
    },
  });

  // Normalize quote dependency rows into the canonical shape Gantt expects.
  const normalizedDeps: StageDependency[] = (depsQ.data ?? []).map((d) => ({
    id: d.id,
    predecessor_id: d.predecessor_stage_id,
    successor_id: d.successor_stage_id,
    type: d.type as DepType,
    lag_days: d.lag_days,
  }));

  return {
    mode: "quote",
    dependencies: normalizedDeps,
    defaultRates: undefined,
    resources,

    updateStage: (a) =>
      updateStageCascade.mutateAsync({
        id: a.id,
        start_date: a.start_date,
        end_date: a.end_date,
      }),
    deleteStage: (a) => deleteStage.mutateAsync(a.id),

    createAllocation: (a) => {
      const rates = snapshotRates(a.resource_id);
      return upsertAlloc.mutateAsync({
        quote_id: quoteId,
        stage_id: a.stage_id,
        resource_id: a.resource_id,
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: a.hours_per_day,
        allocation_percentage: 100,
        cost_rate_snapshot: rates.cost,
        sale_rate_snapshot: rates.sale,
      });
    },
    updateAllocation: (a) =>
      updateAllocMut.mutateAsync({
        id: a.id,
        patch: {
          start_date: a.patch.start_date,
          end_date: a.patch.end_date,
          hours_per_day: a.patch.hours_per_day,
          stage_id: a.patch.stage_id,
          allocation_percentage: a.patch.allocation_percentage,
        },
      }),
    deleteAllocation: (a) => deleteAlloc.mutateAsync(a.id),

    // No status toggle in quote mode — omit setAllocationStatus.

    createDependency: (a) =>
      createDep.mutateAsync({
        quote_id: quoteId,
        predecessor_stage_id: a.predecessor_id,
        successor_stage_id: a.successor_id,
        type: a.type,
        lag_days: a.lag_days,
      }),
    updateDependency: (a) => updateDep.mutateAsync(a),
    deleteDependency: (id) => deleteDep.mutateAsync(id),

    pending: {
      stage: updateStageCascade.isPending || upsertStage.isPending || deleteStage.isPending,
      allocation:
        upsertAlloc.isPending || updateAllocMut.isPending || deleteAlloc.isPending,
      dependency: createDep.isPending || updateDep.isPending || deleteDep.isPending,
    },
    features: QUOTE_FEATURES,
  };
}
