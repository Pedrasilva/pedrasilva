import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type InvoiceSettings = Database["public"]["Tables"]["pm_invoice_settings"]["Row"];
export type InvoiceSettingsUpdate = Database["public"]["Tables"]["pm_invoice_settings"]["Update"];

export function useInvoiceSettings() {
  return useQuery({
    queryKey: ["pm_invoice_settings"],
    queryFn: async (): Promise<InvoiceSettings> => {
      const { data, error } = await supabase
        .from("pm_invoice_settings")
        .select("*")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
      const { data: created, error: insErr } = await supabase
        .from("pm_invoice_settings")
        .insert({ singleton: true, company_name: "" })
        .select("*")
        .single();
      if (insErr) throw insErr;
      return created;
    },
  });
}

export function useUpdateInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: InvoiceSettingsUpdate) => {
      const { data, error } = await supabase
        .from("pm_invoice_settings")
        .update(patch)
        .eq("singleton", true)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["pm_invoice_settings"], data);
    },
  });
}
