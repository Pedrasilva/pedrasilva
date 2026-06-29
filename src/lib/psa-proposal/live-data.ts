/**
 * Live Quote data resolver for the PSA Proposal Composer.
 *
 * Given a quote_id, fetches a compact snapshot that block renderers can
 * consume. Read-only; no writes. Returns `missing[]` so the UI can flag
 * blocks whose source data isn't available yet.
 *
 * Column mapping notes (verified against the live schema):
 *  - fee_proposals: `titulo`, `proposal_number`, `proposal_description`,
 *    `data_proposta`, `valor`, `default_vat_rate`, `company_id`, `account_id`.
 *  - quote_stages: `name`, `description`, `phase_code`, `start_date`,
 *    `end_date`, `budget`, `sort_order`.
 *  - quote_external_services: `description`, `sale_price`,
 *    `supplier_company_id`, `supplier_id`.
 *  - quote_payment_schedule_items: `label`, `trigger_type`, `amount_value`,
 *    `expected_invoice_date`, `sort_order`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LiveStage {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  fee: number | null;
  hours: number | null;
}

export interface LiveQuoteSnapshot {
  quoteId: string;
  projectNumber: string | null;
  projectName: string | null;
  client: string | null;
  location: string | null;
  date: string | null;
  projectDescription: string | null;
  vatStatus: string | null;
  totalArchitectureFee: number | null;
  stages: LiveStage[];
  consultants: Array<{
    id: string;
    name: string;
    discipline: string | null;
    fee: number | null;
  }>;
  paymentSchedule: Array<{
    id: string;
    label: string | null;
    trigger: string | null;
    amount: number | null;
    plannedDate: string | null;
  }>;
  missing: string[];
}

export function useLiveQuoteSnapshot(quoteId: string | null | undefined) {
  return useQuery({
    enabled: !!quoteId,
    queryKey: ["psa-live-quote", quoteId],
    queryFn: async (): Promise<LiveQuoteSnapshot> => {
      const missing: string[] = [];

      const { data: quote } = await supabase
        .from("fee_proposals")
        .select("*")
        .eq("id", quoteId!)
        .maybeSingle();
      if (!quote) missing.push("quote");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (quote ?? {}) as any;

      // Resolve client name from company_id (→ companies.nome) or
      // account_id (→ crm_accounts.name).
      let clientName: string | null = null;
      if (q.company_id) {
        const { data: co } = await supabase
          .from("companies")
          .select("nome")
          .eq("id", q.company_id)
          .maybeSingle();
        clientName = (co as { nome?: string } | null)?.nome ?? null;
      }
      if (!clientName && q.account_id) {
        const { data: acc } = await supabase
          .from("crm_accounts")
          .select("name")
          .eq("id", q.account_id)
          .maybeSingle();
        clientName = (acc as { name?: string } | null)?.name ?? null;
      }

      const { data: stages } = await supabase
        .from("quote_stages")
        .select(
          "id,name,description,phase_code,start_date,end_date,budget,sort_order",
        )
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("start_date", { ascending: true, nullsFirst: false });

      // External services with supplier company name resolved.
      const { data: ext } = await supabase
        .from("quote_external_services")
        .select(
          "id,description,sale_price,supplier_company_id,supplier_id",
        )
        .eq("quote_id", quoteId!);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supplierIds = Array.from(
        new Set(
          ((ext ?? []) as any[])
            .map((e) => e.supplier_company_id)
            .filter(Boolean),
        ),
      ) as string[];
      const supplierNames = new Map<string, string>();
      if (supplierIds.length) {
        const { data: sups } = await supabase
          .from("companies")
          .select("id,nome")
          .in("id", supplierIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((sups ?? []) as any[]).forEach((s) => {
          if (s?.id && s?.nome) supplierNames.set(s.id, s.nome);
        });
      }

      const { data: pay } = await supabase
        .from("quote_payment_schedule_items")
        .select(
          "id,label,trigger_type,amount_value,expected_invoice_date,sort_order",
        )
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("expected_invoice_date", { ascending: true, nullsFirst: false });

      if (!stages?.length) missing.push("stages");
      if (!pay?.length) missing.push("paymentSchedule");

      return {
        quoteId: quoteId!,
        projectNumber: q.proposal_number ? String(q.proposal_number) : null,
        projectName: q.titulo ?? null,
        client: clientName,
        location: null,
        date: q.data_proposta ?? q.updated_at ?? null,
        projectDescription: q.proposal_description ?? null,
        vatStatus:
          q.default_vat_rate != null ? `IVA ${q.default_vat_rate}%` : null,
        totalArchitectureFee: q.valor ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stages: (stages ?? []).map((s: any) => {
          const start = s.start_date ? new Date(s.start_date) : null;
          const end = s.end_date ? new Date(s.end_date) : null;
          const days =
            start && end
              ? Math.max(
                  1,
                  Math.round(
                    (end.getTime() - start.getTime()) / 86400000,
                  ) + 1,
                )
              : null;
          return {
            id: s.id,
            name: s.name,
            code: s.phase_code ?? null,
            description: s.description ?? null,
            startDate: s.start_date,
            endDate: s.end_date,
            durationDays: days,
            fee: s.budget ?? null,
            hours: null,
          };
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        consultants: (ext ?? []).map((c: any) => ({
          id: c.id,
          name:
            (c.supplier_company_id && supplierNames.get(c.supplier_company_id)) ||
            c.description ||
            "—",
          discipline: c.description ?? null,
          fee: c.sale_price ?? null,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paymentSchedule: (pay ?? []).map((p: any) => ({
          id: p.id,
          label: p.label,
          trigger: p.trigger_type,
          amount: p.amount_value,
          plannedDate: p.expected_invoice_date,
        })),
        missing,
      };
    },
  });
}

export function formatCurrencyEUR(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDatePT(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(
      new Date(d),
    );
  } catch {
    return d;
  }
}
