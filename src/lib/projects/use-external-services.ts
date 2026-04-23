import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ExternalService = Database["public"]["Tables"]["pm_materials"]["Row"];
export type ExternalServiceInsert =
  Database["public"]["Tables"]["pm_materials"]["Insert"];
export type ExternalServiceUpdate =
  Database["public"]["Tables"]["pm_materials"]["Update"];

export type ExternalServiceStatus =
  Database["public"]["Enums"]["pm_external_service_status"];
export type MarkupType = Database["public"]["Enums"]["pm_markup_type"];

export const EXTERNAL_SERVICE_STATUSES: ExternalServiceStatus[] = [
  "draft",
  "approved",
  "ordered",
  "invoiced",
  "partially_paid",
  "paid",
  "cancelled",
];

export function useExternalServices(projectId: string | undefined) {
  return useQuery({
    queryKey: ["external-services", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_materials")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExternalService[];
    },
  });
}

export function useUpsertExternalService(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExternalServiceInsert | ExternalServiceUpdate) => {
      if ((input as ExternalServiceUpdate).id) {
        const { id, ...rest } = input as ExternalServiceUpdate & { id: string };
        const { data, error } = await supabase
          .from("pm_materials")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("pm_materials")
        .insert({ ...(input as ExternalServiceInsert), project_id: projectId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-services", projectId] });
      qc.invalidateQueries({ queryKey: ["project-insights", projectId] });
    },
  });
}

export function useDeleteExternalService(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-services", projectId] });
      qc.invalidateQueries({ queryKey: ["project-insights", projectId] });
    },
  });
}
