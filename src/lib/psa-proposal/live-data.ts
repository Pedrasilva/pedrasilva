/**
 * Live Quote data resolver for the PSA Proposal Composer.
 *
 * Given a quote_id, fetches a compact snapshot that block renderers can
 * consume. Read-only; no writes. Returns `missing[]` so the UI can flag
 * blocks whose source data isn't available yet.
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
      // Fee proposal (header)
      const { data: quote } = await supabase
        .from("fee_proposals")
        .select("*")
        .eq("id", quoteId!)
        .maybeSingle();
      if (!quote) missing.push("quote");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (quote ?? {}) as any;

      // Stages
      const { data: stages } = await supabase
        .from("quote_stages")
        .select("id,name,description,phase_code,start_date,end_date,budget")
        .eq("quote_id", quoteId!)
        .order("start_date", { ascending: true, nullsFirst: false });

      // External services / consultants
      const { data: ext } = await supabase
        .from("quote_external_services")
        .select("id,name,discipline,fee_amount")
        .eq("quote_id", quoteId!);

      // Payment schedule
      const { data: pay } = await supabase
        .from("quote_payment_schedule_items")
        .select("id,label,trigger,amount,planned_date")
        .eq("quote_id", quoteId!)
        .order("planned_date", { ascending: true, nullsFirst: false });

      if (!stages?.length) missing.push("stages");
      if (!pay?.length) missing.push("paymentSchedule");

      return {
        quoteId: quoteId!,
        projectNumber: q.project_code ?? q.code ?? null,
        projectName: q.project_name ?? q.title ?? null,
        client: q.client_name ?? null,
        location: q.location ?? null,
        date: q.proposal_date ?? q.updated_at ?? null,
        projectDescription: q.project_description ?? q.description ?? null,
        vatStatus: q.vat_mode ?? null,
        totalArchitectureFee: q.total_internal_fee ?? q.total_fee ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stages: (stages ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          startDate: s.start_date,
          endDate: s.end_date,
          durationDays: s.duration_days,
          fee: s.fee,
          hours: s.estimated_hours,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        consultants: (ext ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          discipline: c.discipline,
          fee: c.fee_amount,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paymentSchedule: (pay ?? []).map((p: any) => ({
          id: p.id,
          label: p.label,
          trigger: p.trigger,
          amount: p.amount,
          plannedDate: p.planned_date,
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
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(new Date(d));
  } catch {
    return d;
  }
}
