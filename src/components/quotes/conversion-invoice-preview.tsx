import uiI18n from "@/i18n/index";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { groupInvoices } from "@/lib/quotes/invoice-grouping";

type PreviewPayment = { id: string; label: string; amount: number; expected_invoice_date: string | null; expected_payment_date: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Conversion preview invoices, grouped on the real (live) dates exactly as the project will regroup them. */
export function ConversionInvoicePreview({ quoteId, payments }: { quoteId: string; payments: PreviewPayment[] }) {
  const q = useQuery({
    queryKey: ["conversion-invoice-meta", quoteId],
    queryFn: async () => {
      const [items, quote] = await Promise.all([
        db.from("quote_payment_schedule_items").select("id,payment_terms,vat_rate,billing_status,direction").eq("quote_id", quoteId),
        db.from("fee_proposals").select("invoice_grouping_enabled,invoice_grouping_days").eq("id", quoteId).single(),
      ]);
      if (items.error) throw items.error;
      if (quote.error) throw quote.error;
      return { items: items.data as Array<{ id: string; payment_terms: string | null; vat_rate: number | null; billing_status: string | null; direction: string | null }>, quote: quote.data as { invoice_grouping_enabled: boolean; invoice_grouping_days: number } };
    },
  });
  const eur = (n: number) => new Intl.NumberFormat(uiI18n.language, { style: "currency", currency: "EUR" }).format(n);
  const meta = new Map((q.data?.items ?? []).map((i) => [i.id, i]));
  const byId = new Map(payments.map((p) => [p.id, p]));
  const groups = q.data?.quote.invoice_grouping_enabled
    ? groupInvoices(payments.map((p) => ({ ...meta.get(p.id), id: p.id, expected_invoice_date: p.expected_invoice_date })), q.data.quote.invoice_grouping_days)
    : payments.map((p) => ({ ids: [p.id], date: p.expected_invoice_date ?? "" }));
  return <>{groups.map((g) => {
    const rows = g.ids.map((id) => byId.get(id)!).filter(Boolean);
    return <div key={g.ids.join(":")} className="border-t border-border py-1">
      {rows.map((p) => <div key={p.id} className="flex flex-wrap justify-between gap-2"><span>{p.label} · {eur(p.amount)}</span><span>{g.date}</span></div>)}
      {rows.length > 1 && <div className="flex justify-end font-medium">{eur(rows.reduce((s, p) => s + (Number(p.amount) || 0), 0))}</div>}
    </div>;
  })}</>;
}
