// Pursuit hours: time logged against an open CRM lead before it becomes a
// project. Entries are entry_type 'internal' with internal_category =
// PURSUIT_CATEGORY and opportunity_id set (enforced by a DB trigger).
//
// Lead names come from the SECURITY DEFINER function crm_leads_directory
// (id, name, company, stage, is_open only) so everyone can log pursuit time
// without reading crm_opportunities. Project-side totals come from
// pm_project_pursuit_totals, gated like project financials.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { effectiveCostRate, type DefaultRateInfo } from "@/lib/projects/use-default-rates";

export const PURSUIT_CATEGORY = "Pursuit";

export type LeadDirectoryRow = {
  id: string;
  name: string;
  company_name: string | null;
  stage: string;
  is_open: boolean;
};

export function useLeadsDirectory(enabled = true) {
  return useQuery({
    queryKey: ["crm-leads-directory"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<LeadDirectoryRow[]> => {
      const { data, error } = await supabase.rpc("crm_leads_directory");
      if (error) throw error;
      return (data ?? []) as LeadDirectoryRow[];
    },
  });
}

export type PursuitTotalRow = {
  project_id: string;
  resource_id: string | null;
  hours: number;
  snapshot_cost: number;
  hours_without_snapshot: number;
};

/** Pursuit totals per project × resource. Empty for people without project-financials access. */
export function usePursuitTotals(projectIds: string[] | null, enabled = true) {
  return useQuery({
    queryKey: ["pm-pursuit-totals", projectIds],
    enabled,
    queryFn: async (): Promise<PursuitTotalRow[]> => {
      const { data, error } = await supabase.rpc("pm_project_pursuit_totals", {
        _project_ids: projectIds ?? undefined,
      } as never);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        project_id: String(r.project_id),
        resource_id: (r.resource_id as string | null) ?? null,
        hours: Number(r.hours ?? 0),
        snapshot_cost: Number(r.snapshot_cost ?? 0),
        hours_without_snapshot: Number(r.hours_without_snapshot ?? 0),
      }));
    },
  });
}

/**
 * Hours and cost per project. Cost = hours × cost_rate_snapshot where a
 * snapshot exists; otherwise the resource's effective cost rate, the same
 * rate the project views use for logged project hours.
 */
export function pursuitByProject(
  rows: PursuitTotalRow[],
  resourceCost: (resourceId: string) => { cost_rate: number | null; isOverride?: boolean } | undefined,
  defaults: Map<string, DefaultRateInfo> | undefined,
): Map<string, { hours: number; cost: number }> {
  const out = new Map<string, { hours: number; cost: number }>();
  for (const r of rows) {
    const cur = out.get(r.project_id) ?? { hours: 0, cost: 0 };
    let rate = 0;
    if (r.resource_id) {
      const res = resourceCost(r.resource_id);
      rate = effectiveCostRate(res?.cost_rate, r.resource_id, defaults, res?.isOverride);
    }
    cur.hours += r.hours;
    cur.cost += r.snapshot_cost + r.hours_without_snapshot * rate;
    out.set(r.project_id, cur);
  }
  return out;
}

export function useOpportunityPursuitHours(opportunityId: string | undefined) {
  return useQuery({
    queryKey: ["crm-opportunity-pursuit-hours", opportunityId],
    enabled: !!opportunityId,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc("crm_opportunity_pursuit_hours", {
        _opportunity_id: opportunityId!,
      });
      if (error) throw error;
      return data == null ? null : Number(data);
    },
  });
}

export function useLinkableOpportunities(enabled: boolean) {
  return useQuery({
    queryKey: ["pm-linkable-opportunities"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pm_linkable_opportunities");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; company_name: string | null; stage: string }[];
    },
  });
}

export function useLinkProjectOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; opportunityId: string | null }) => {
      const { error } = await supabase.rpc("pm_link_project_opportunity", {
        _project_id: input.projectId,
        _opportunity_id: input.opportunityId as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-pursuit-totals"] });
      qc.invalidateQueries({ queryKey: ["pm-project"] });
      qc.invalidateQueries({ queryKey: ["pm-projects"] });
    },
  });
}
