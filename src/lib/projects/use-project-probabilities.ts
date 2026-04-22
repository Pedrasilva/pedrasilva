// Maps each delivery project (pm_projects.id) to the probability that the
// associated work will actually happen, based on the linked CRM fee proposal.
//
// Why this exists:
//   Forecast views used to assume 100% realisation of every planned allocation,
//   regardless of whether the project was already won or still a pipeline
//   opportunity. That over-states future revenue / workload / margin whenever
//   we have planning in the Gantt for proposals that are still being negotiated.
//
// Rules (single source of truth):
//   - A project linked to a `fee_proposals` row inherits that proposal's
//     `probabilidade` (0..100) — but the pipeline_status overrides it:
//       * "ganho"            → weight = 1   (committed, even if proba < 100)
//       * "perdido"          → weight = 0   (work won't happen)
//       * "lead" / "proposta_enviada" / "negociacao" → weight = probabilidade/100
//   - A project with NO proposal link is committed work → weight = 1.
//   - If multiple proposals point at the same project (rare), use the highest
//     probability (most optimistic, but capped by the rules above).
//
// Consumers should multiply forecast quantities (planned hours, planned
// revenue, planned cost, planned margin) by `weight`. Capacity and leave
// conflicts intentionally remain un-weighted — if a person is allocated they
// are blocked from doing other things regardless of whether the deal closes.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ProposalStatus = Database["public"]["Enums"]["proposal_status"];

export type ProjectProbability = {
  /** Multiplier in [0, 1] that should be applied to forecast quantities. */
  weight: number;
  /** Raw proposal probability (0..100), useful for tooltips. Null if no proposal. */
  probability: number | null;
  /** Linked proposal's pipeline status, or null if the project has no proposal. */
  status: ProposalStatus | null;
  /** True when weight === 1 because the work is committed (won or no proposal). */
  isCommitted: boolean;
  /** True when weight is in (0, 1) because the project depends on an open proposal. */
  isPipeline: boolean;
};

export type ProjectProbabilityMap = Map<string, ProjectProbability>;

const COMMITTED: ProjectProbability = {
  weight: 1,
  probability: null,
  status: null,
  isCommitted: true,
  isPipeline: false,
};

/**
 * Convert a CRM proposal into the corresponding project-level probability.
 * Exported so non-hook callers (e.g. tests or one-off aggregations) can reuse
 * the exact same logic.
 */
export function probabilityFromProposal(
  status: ProposalStatus,
  probabilidade: number,
): ProjectProbability {
  if (status === "ganho") {
    // Won deals are committed work even if the user never bumped the slider to 100.
    return { weight: 1, probability: probabilidade, status, isCommitted: true, isPipeline: false };
  }
  if (status === "perdido") {
    // Lost deals contribute nothing to forecast.
    return { weight: 0, probability: probabilidade, status, isCommitted: false, isPipeline: false };
  }
  // lead / proposta_enviada / negociacao → weighted pipeline.
  const w = Math.max(0, Math.min(1, Number(probabilidade) / 100));
  return { weight: w, probability: probabilidade, status, isCommitted: false, isPipeline: true };
}

/**
 * Look up a project's probability with a safe default. Projects with no
 * proposal row are treated as committed work (weight = 1).
 */
export function probabilityFor(
  projectId: string,
  map: ProjectProbabilityMap | undefined,
): ProjectProbability {
  return map?.get(projectId) ?? COMMITTED;
}

export function useProjectProbabilities() {
  return useQuery({
    queryKey: ["forecast-project-probabilities"],
    queryFn: async (): Promise<ProjectProbabilityMap> => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("pm_project_id, probabilidade, pipeline_status")
        .not("pm_project_id", "is", null);
      if (error) throw error;

      const out: ProjectProbabilityMap = new Map();
      for (const row of (data ?? []) as Array<{
        pm_project_id: string | null;
        probabilidade: number;
        pipeline_status: ProposalStatus;
      }>) {
        if (!row.pm_project_id) continue;
        const next = probabilityFromProposal(row.pipeline_status, Number(row.probabilidade));
        const existing = out.get(row.pm_project_id);
        // Multiple proposals on the same project → keep the most optimistic
        // (highest weight). Won always wins because its weight is 1.
        if (!existing || next.weight > existing.weight) {
          out.set(row.pm_project_id, next);
        }
      }
      return out;
    },
  });
}
