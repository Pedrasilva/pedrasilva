import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProjectTeamRole = Database["public"]["Enums"]["pm_project_team_role"];

export const PROJECT_TEAM_ROLES: ProjectTeamRole[] = [
  "manager",
  "coordinator",
  "co_author",
  "support",
];

export type ProjectTeamMember = {
  id: string;
  project_id: string;
  resource_id: string;
  role: ProjectTeamRole;
};

export function useProjectTeam(projectId: string | undefined) {
  return useQuery({
    queryKey: ["pm-project-team", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectTeamMember[]> => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("pm_project_team")
        .select("id, project_id, resource_id, role")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as ProjectTeamMember[];
    },
  });
}

export function useAddProjectTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { project_id: string; resource_id: string; role: ProjectTeamRole; reason: string }) => {
      const { error } = await supabase.rpc("pm_change_project_team", {_project:input.project_id,_resource:input.resource_id,_role:input.role,_remove:false,_reason:input.reason});
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project-team", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["pm-project-access-preview", vars.project_id] });
    },
  });
}

export function useRemoveProjectTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; project_id: string; resource_id: string; role: ProjectTeamRole; reason: string }) => {
      const { error } = await supabase.rpc("pm_change_project_team", {_project:input.project_id,_resource:input.resource_id,_role:input.role,_remove:true,_reason:input.reason});
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project-team", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["pm-project-access-preview", vars.project_id] });
    },
  });
}
