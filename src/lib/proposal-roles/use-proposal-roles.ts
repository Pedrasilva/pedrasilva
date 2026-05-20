import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProposalRole } from "./types";

export const proposalRoleKeys = {
  all: ["proposal-roles"] as const,
  list: (opts: { includeArchived?: boolean } = {}) =>
    ["proposal-roles", "list", opts] as const,
};

/** Lists the proposal role catalog. Active-only by default. */
export function useProposalRoles({
  includeArchived = false,
}: { includeArchived?: boolean } = {}) {
  return useQuery({
    queryKey: proposalRoleKeys.list({ includeArchived }),
    queryFn: async (): Promise<ProposalRole[]> => {
      let q = supabase
        .from("proposal_roles")
        .select("*")
        .order("sort_order", { ascending: true });
      if (!includeArchived) q = q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProposalRole[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
