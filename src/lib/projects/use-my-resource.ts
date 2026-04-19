import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the pm_resources.id linked to the current authenticated user
 * (matched by email or via collaborator_id). Returns null if no link exists.
 */
export function useMyResourceId() {
  return useQuery({
    queryKey: ["pm_my-resource-id"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc("pm_get_my_resource_id");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}
