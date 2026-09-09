// Collaborator "work profile" — TIMESHEET UX DEFAULTS ONLY.
//
// `collaborators.work_profile` decides how the weekly timesheet is presented:
//   project  → project rows first, internal categories after (default, legacy behaviour)
//   mixed    → internal categories first, project section still visible below
//   support  → internal categories first, project section hidden by default
//
// It is NEVER read by costing/pricing (computePricing, cotaBoPorColabProjecto,
// hybrid-resource-cost, cost_rate/sale_rate, quote snapshots, BO overhead).
// The underlying data model (pm_time_entries, pm_internal_categories) is
// unchanged and shared by every profile.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkProfile = "project" | "mixed" | "support";

export const WORK_PROFILES: WorkProfile[] = ["project", "mixed", "support"];

export function normalizeWorkProfile(value: unknown): WorkProfile {
  return value === "mixed" || value === "support" ? value : "project";
}

/** Read the work profile of a collaborator (defaults to "project"). */
export function useWorkProfile(collaboratorId: string | null | undefined) {
  return useQuery({
    queryKey: ["collaborator-work-profile", collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async (): Promise<WorkProfile> => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("work_profile")
        .eq("id", collaboratorId!)
        .maybeSingle();
      if (error) throw error;
      return normalizeWorkProfile(
        (data as { work_profile?: string } | null)?.work_profile,
      );
    },
  });
}

/** UX layout derived from the profile. Pure presentation. */
export function workProfileLayout(profile: WorkProfile) {
  return {
    /** Render the internal-categories section before the project section. */
    internalFirst: profile !== "project",
    /** Hide the project section behind an explicit toggle. */
    projectsHiddenByDefault: profile === "support",
  };
}
