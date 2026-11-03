import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProjectStageRoles(projectId: string) {
  return useQuery({
    queryKey: ["pm-project-stage-roles", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pm_project_stage_roles", { _project_id: projectId });
      if (error) throw error;
      return data ?? [];
    },
  });
}