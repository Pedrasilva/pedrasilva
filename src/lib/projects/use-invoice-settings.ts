import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type InvoiceSettings = Database["public"]["Tables"]["pm_invoice_settings"]["Row"];
export type InvoiceSettingsUpdate = Database["public"]["Tables"]["pm_invoice_settings"]["Update"];

export function useInvoiceSettings(projectId: string) {
  return useQuery({
    queryKey: ["pm-invoice-settings", projectId],
    queryFn: async (): Promise<InvoiceSettings> => {
      const { data, error } = await supabase
        .from("pm_invoice_settings")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
      const { data: created, error: insErr } = await supabase
        .from("pm_invoice_settings")
        .insert({ project_id: projectId })
        .select("*")
        .single();
      if (insErr) throw insErr;
      return created;
    },
  });
}

export function useUpdateInvoiceSettings(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: InvoiceSettingsUpdate) => {
      const { data, error } = await supabase
        .from("pm_invoice_settings")
        .update(patch)
        .eq("project_id", projectId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["pm-invoice-settings", projectId], data);
    },
  });
}
