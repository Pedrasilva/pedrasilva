import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Invoice = Database["public"]["Tables"]["pm_invoices"]["Row"];
export type InvoiceInsert = Database["public"]["Tables"]["pm_invoices"]["Insert"];
export type InvoiceLineItem = Database["public"]["Tables"]["pm_invoice_items"]["Row"];
export type InvoiceLineItemInsert = Database["public"]["Tables"]["pm_invoice_items"]["Insert"];

export function useProjectInvoices(projectId: string) {
  return useQuery({
    queryKey: ["pm_invoices", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("pm_invoices")
        .select("*")
        .eq("project_id", projectId)
        .order("raised_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvoiceWithItems(invoiceId: string | null) {
  return useQuery({
    queryKey: ["pm_invoice", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      if (!invoiceId) return null;
      const { data: inv, error: e1 } = await supabase
        .from("pm_invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (e1) throw e1;
      const { data: items, error: e2 } = await supabase
        .from("pm_invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("sort_order", { ascending: true });
      if (e2) throw e2;
      return { invoice: inv as Invoice, items: (items ?? []) as InvoiceLineItem[] };
    },
  });
}

export function useNextInvoiceNumber(projectId: string) {
  return useQuery({
    queryKey: ["pm_next-invoice-number", projectId],
    queryFn: async () => {
      const { count } = await supabase
        .from("pm_invoices")
        .select("id", { count: "exact", head: true });
      const next = (count ?? 0) + 1;
      return `#${100 + next}`;
    },
  });
}

export function useCreateInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      invoice: Omit<InvoiceInsert, "project_id">;
      items: Array<Omit<InvoiceLineItemInsert, "invoice_id">>;
    }) => {
      const { data: inv, error } = await supabase
        .from("pm_invoices")
        .insert({ ...input.invoice, project_id: projectId })
        .select("*")
        .single();
      if (error) throw error;
      if (input.items.length) {
        const rows = input.items.map((it, i) => ({
          ...it,
          invoice_id: inv.id,
          sort_order: it.sort_order ?? i,
        }));
        const { error: e2 } = await supabase.from("pm_invoice_items").insert(rows);
        if (e2) throw e2;
      }
      return inv as Invoice;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm_invoices", projectId] });
      qc.invalidateQueries({ queryKey: ["pm_next-invoice-number", projectId] });
    },
  });
}

export function useUpdateInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<InvoiceInsert> }) => {
      const { data, error } = await supabase
        .from("pm_invoices")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm_invoices", projectId] });
      qc.invalidateQueries({ queryKey: ["pm_invoice", vars.id] });
    },
  });
}

export function useDeleteInvoice(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_invoices", projectId] }),
  });
}
