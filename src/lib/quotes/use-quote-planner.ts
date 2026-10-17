/**
 * Quote-mode planner mutations: cascade + dependency update.
 * Reuses the pure `computeCascade` from project mode; only the I/O layer
 * differs (quote_stages / quote_allocations / quote_stage_dependencies).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { changeGanttStage, changeGanttDependency } from "@/lib/projects/gantt-schedule";
import { type DepType } from "@/lib/projects/dependencies";



export function useUpdateQuoteStageWithCascade(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      start_date,
      end_date,
      shiftAllocations = true,
      move = false,
    }: {
      id: string;
      start_date: string;
      end_date: string;
      shiftAllocations?: boolean;
      move?: boolean;
    }) => {
      void shiftAllocations;
      return changeGanttStage("quote",quoteId,id,start_date,end_date,move);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
      qc.invalidateQueries({ queryKey: ["psa-live-quote", quoteId] });
    },
  });
}

export function useUpdateQuoteDependency(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { type?: DepType; lag_days?: number };
    }) => {
      return changeGanttDependency("quote",quoteId,"update",{id,...patch});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
      qc.invalidateQueries({ queryKey: ["psa-live-quote", quoteId] });
    },
  });
}
