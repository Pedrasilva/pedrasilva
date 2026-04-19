import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePdf, downloadPdf } from "./invoice-pdf";
import type { Invoice, InvoiceLineItem } from "./use-invoices";
import { useInvoiceSettings } from "./use-invoice-settings";

export function useDownloadInvoicePdf(projectId: string) {
  const qc = useQueryClient();
  const { data: settings } = useInvoiceSettings();

  return async (invoice: Invoice) => {
    if (!settings) throw new Error("Invoice settings not loaded");

    const { data: items, error } = await supabase
      .from("pm_invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const { data: project } = await supabase
      .from("pm_projects")
      .select("name, client")
      .eq("id", projectId)
      .single();

    const bytes = await generateInvoicePdf({
      invoice,
      items: (items ?? []) as InvoiceLineItem[],
      project: { name: project?.name ?? "Project", client: project?.client ?? null },
      settings,
    });

    downloadPdf(bytes, `${invoice.invoice_number}.pdf`);
    qc.invalidateQueries({ queryKey: ["pm_invoices", projectId] });
  };
}
