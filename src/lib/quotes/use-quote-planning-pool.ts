/**
 * Quote Planner Team Pool resolver.
 *
 * Returns:
 *  - allResources:  every active pm_resource (used by Gantt so historical
 *                   allocations referencing archived/excluded users still
 *                   render correctly).
 *  - poolResources: the subset eligible for drag-and-drop / new allocations:
 *                     active = true
 *                     collaborator.archived_at IS NULL
 *                     collaborator.include_in_planning = true
 *                   Each entry has hourly_rate/cost_rate rewritten with the
 *                   HR-derived effective rate (override → HR default).
 *  - rateMissing:   Set<resourceId> for resources whose effective sale rate
 *                   could not be resolved (so the UI can show "Rate missing"
 *                   instead of silently rendering €0/h).
 *
 * No quote calculations, no project/HR/finance writes — read-only derivation.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Resource } from "@/lib/projects/types";
import { useDefaultResourceRates, effectiveRates } from "@/lib/projects/use-default-rates";

function useEligibleCollaboratorIds() {
  return useQuery({
    queryKey: ["planning-eligible-collaborators"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("collaborators")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, include_in_planning, archived_at" as any)
        .is("archived_at", null)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("include_in_planning" as any, true);
      if (error) throw error;
      return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
    },
  });
}

export function useQuotePlanningPool() {
  const resourcesQ = useQuery({
    queryKey: ["pm-resources-active-full"],
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await supabase
        .from("pm_resources")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Resource[];
    },
  });

  const eligibleQ = useEligibleCollaboratorIds();
  const { data: defaults } = useDefaultResourceRates();

  const allResources = resourcesQ.data ?? [];
  const eligible = eligibleQ.data;

  const { poolResources, rateMissing } = useMemo(() => {
    const missing = new Set<string>();
    if (!eligible) return { poolResources: [] as Resource[], rateMissing: missing };
    const pool: Resource[] = [];
    for (const r of allResources) {
      if (!r.collaborator_id || !eligible.has(r.collaborator_id)) continue;
      const eff = effectiveRates(r, defaults);
      if (eff.sale <= 0) missing.add(r.id);
      pool.push({
        ...r,
        hourly_rate: eff.sale,
        sale_rate: eff.sale,
        cost_rate: eff.cost,
      });
    }
    return { poolResources: pool, rateMissing: missing };
  }, [allResources, eligible, defaults]);

  return {
    allResources,
    poolResources,
    rateMissing,
    isLoading: resourcesQ.isLoading || eligibleQ.isLoading,
  };
}
