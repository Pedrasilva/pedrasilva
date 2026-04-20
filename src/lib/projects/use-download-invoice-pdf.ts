import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePdf, downloadPdf } from "@/lib/projects/invoice-pdf";
import type { Invoice, InvoiceLineItem } from "@/lib/projects/use-invoices";
import { useInvoiceSettings } from "@/lib/projects/use-invoice-settings";

export function useDownloadInvoicePdf(projectId: string) {
  const qc = useQueryClient();
  const { data: settings } = useInvoiceSettings(projectId);

  return async (invoice: Invoice) => {
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

    const { data: rel } = await supabase
      .from("pm_invoices")
      .select("id, invoice_number, title, bill_to_name, raised_date, due_date, tax_rate, status, paid_date")
      .eq("project_id", projectId)
      .neq("id", invoice.id)
      .order("raised_date", { ascending: false })
      .limit(8);

    const relatedWithTotals = await Promise.all(
      (rel ?? []).map(async (r) => {
        const { data: relItems } = await supabase
          .from("pm_invoice_items")
          .select("quantity, rate")
          .eq("invoice_id", r.id);
        const sub = (relItems ?? []).reduce((a, x) => a + Number(x.quantity) * Number(x.rate), 0);
        const t = sub * (1 + Number(r.tax_rate) / 100);
        return {
          raised_date: r.raised_date,
          due_date: r.due_date ?? r.raised_date,
          invoice_number: r.invoice_number,
          title: r.title,
          bill_to_name: r.bill_to_name,
          total: t,
          outstanding: r.status === "paid" ? 0 : t,
        };
      }),
    );

    const bytes = await generateInvoicePdf({
      invoice,
      items: (items ?? []) as InvoiceLineItem[],
      project: { name: project?.name ?? "Project", client: project?.client ?? null },
      related: relatedWithTotals,
      brand: {
        company: project?.client ?? project?.name ?? "Your Company",
      },
    });

    const baseName = settings?.file_name || "invoice";
    downloadPdf(bytes, `${baseName}-${invoice.invoice_number.replace(/^#/, "")}.pdf`);
    qc.invalidateQueries({ queryKey: ["pm-invoices", projectId] });
  };
}
