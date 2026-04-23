import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Supplier } from "@/lib/projects/use-suppliers";
import { assertProjectOwned } from "@/lib/finance/ownership";

export type ExternalService = Database["public"]["Tables"]["pm_materials"]["Row"] & {
  // Freshly added column — not yet in generated types.
  supplier_id?: string | null;
};
export type ExternalServiceInsert =
  Database["public"]["Tables"]["pm_materials"]["Insert"] & {
    supplier_id?: string | null;
  };
export type ExternalServiceUpdate =
  Database["public"]["Tables"]["pm_materials"]["Update"] & {
    supplier_id?: string | null;
  };

export type ExternalServiceWithSupplier = ExternalService & {
  supplier: Pick<Supplier, "id" | "name" | "active"> | null;
};

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useExternalServices(projectId: string | undefined) {
  return useQuery({
    queryKey: ["external-services", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ExternalServiceWithSupplier[]> => {
      // Embed the linked supplier when present. Two-step fallback so that
      // legacy rows (supplier_id IS NULL) still come through cleanly via
      // supplier_name. PostgREST returns the embedded record as null when
      // the FK is NULL.
      const { data, error } = await db
        .from("pm_materials")
        .select("*, supplier:pm_suppliers(id,name,active)")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExternalServiceWithSupplier[];
    },
  });
}

export function useUpsertExternalService(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExternalServiceInsert | ExternalServiceUpdate) => {
      // Ownership rule: external services / materials are project-owned.
      assertProjectOwned(projectId);
      if ((input as ExternalServiceUpdate).id) {
        const { id, ...rest } = input as ExternalServiceUpdate & { id: string };
        const { data, error } = await db
          .from("pm_materials")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await db
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
