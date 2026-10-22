import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { opportunityProjects, type OpportunityProject, type ProjectQuoteLink } from "./opportunity-projects";

export function useOpportunityProjects() {
  return useQuery({
    queryKey: ["crm_opportunity_projects"],
    queryFn: async () => {
      const projects: OpportunityProject[] = [];
      const quotes: ProjectQuoteLink[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("pm_projects")
          .select("id,name,status,opportunity_id,quote_id").order("id").range(offset, offset + 999);
        if (error) throw error;
        projects.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      // Archived quotes still prove a historical conversion; do not filter them.
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("fee_proposals")
          .select("id,opportunity_id,pm_project_id").order("id").range(offset, offset + 999);
        if (error) throw error;
        quotes.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      return opportunityProjects(projects, quotes);
    },
  });
}