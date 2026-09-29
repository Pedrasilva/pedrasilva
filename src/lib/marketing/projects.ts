import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CLEARANCE_ORDER = ["internal_only", "needs_client_approval", "unknown", "cleared"] as const;
export type Clearance = (typeof CLEARANCE_ORDER)[number];
export const NAME_RULES = ["name", "describe_only", "never_mention"] as const;
export type NameRule = (typeof NAME_RULES)[number];
export const STORY_FIELDS = ["client_ambition", "central_idea", "challenges", "proud_of", "key_facts"] as const;
export type StoryField = (typeof STORY_FIELDS)[number];

export const CLEARANCE_BADGE: Record<Clearance, string> = {
  cleared: "bg-success/15 text-success border-success/30",
  needs_client_approval: "bg-warning/15 text-warning border-warning/30",
  internal_only: "bg-destructive/15 text-destructive border-destructive/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export type ProjectProfile = {
  id: string;
  project_id: string;
  sector: "workspace" | "healthcare" | "residential" | "hospitality" | "other" | null;
  location: string | null;
  stage: "design" | "construction" | "completed" | "other" | null;
  year_completed: number | null;
  client_ambition: string | null;
  central_idea: string | null;
  challenges: string | null;
  proud_of: string | null;
  key_facts: string | null;
  name_rule: NameRule;
  public_description: string | null;
  clearance: Clearance;
  rules_notes: string | null;
  aliases: string[];
  updated_at: string;
};

export const PROFILES_QUERY_KEY = ["marketing-project-profiles"] as const;

/** Profiles visible to the current user (RLS decides). */
export function useProjectProfiles() {
  return useQuery({
    queryKey: PROFILES_QUERY_KEY,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_project_profiles")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectProfile[];
    },
  });
}

/** Strictest of two clearances (mirrors marketing_effective_clearance). */
export function strictestClearance(own: Clearance, project: Clearance | null | undefined): Clearance {
  if (!project) return own;
  return CLEARANCE_ORDER.indexOf(project) < CLEARANCE_ORDER.indexOf(own) ? project : own;
}

export function storyCompleteness(p: Pick<ProjectProfile, StoryField>) {
  return STORY_FIELDS.filter((f) => (p[f] ?? "").trim().length > 0).length;
}
