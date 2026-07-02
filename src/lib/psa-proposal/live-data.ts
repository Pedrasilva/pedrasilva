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
  isSelf: boolean;
  isMilestone: boolean;
  parentStageId: string | null;
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
          "id,name,description,phase_code,start_date,end_date,budget,sort_order,is_self,is_milestone,parent_stage_id",
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
        totalArchitectureFee:
          q.valor && Number(q.valor) > 0
            ? Number(q.valor)
            : ((stages ?? []) as Array<{ is_self?: boolean; budget?: number | null }>)
                .filter((s) => s.is_self !== false)
                .reduce((sum, s) => sum + (Number(s.budget) || 0), 0) || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stages: (stages ?? []).map((s: any) => {
          const start = s.start_date ? new Date(s.start_date) : null;
          const end = s.end_date ? new Date(s.end_date) : null;
          // Working days (Mon–Fri) inclusive — matches the planner Gantt label.
          let days: number | null = null;
          if (start && end) {
            let count = 0;
            const cur = new Date(start);
            while (cur <= end) {
              const d = cur.getDay();
              if (d !== 0 && d !== 6) count++;
              cur.setDate(cur.getDate() + 1);
            }
            days = Math.max(1, count);
          }
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
            isSelf: s.is_self !== false,
            isMilestone: s.is_milestone === true,
            parentStageId: s.parent_stage_id ?? null,
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

/** Two-letter locale used for proposal rendering. */
export type ProposalLang = "pt-PT" | "en";

export function resolveProposalLang(v: string | null | undefined): ProposalLang {
  const s = (v ?? "").toLowerCase();
  if (s.startsWith("en")) return "en";
  return "pt-PT";
}

export function formatCurrencyEUR(n: number | null | undefined, lang: ProposalLang = "pt-PT"): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDatePT(d: string | null | undefined, lang: ProposalLang = "pt-PT"): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(
      new Date(d),
    );
  } catch {
    return d;
  }
}

/**
 * Format a working-day duration adaptively in the given proposal language.
 *  - <7 days  → "N day(s)" / "N dia(s)"
 *  - <20 days → "N week(s)" / "N semana(s)" (5 working days per week)
 *  - otherwise → "N month(s)" / "N mês/meses" (≈ 20 working days per month)
 */
export function formatDurationAdaptive(
  days: number | null | undefined,
  lang: ProposalLang = "pt-PT",
): string {
  if (days == null || !Number.isFinite(days)) return "—";
  const d = Math.max(1, Math.round(days));
  const isEn = lang === "en";
  if (d < 7) {
    return `${d} ${isEn ? (d === 1 ? "day" : "days") : d === 1 ? "dia" : "dias"}`;
  }
  if (d < 20) {
    const w = Math.max(1, Math.round(d / 5));
    return `${w} ${isEn ? (w === 1 ? "week" : "weeks") : w === 1 ? "semana" : "semanas"}`;
  }
  const m = Math.max(1, Math.round(d / 20));
  return `${m} ${isEn ? (m === 1 ? "month" : "months") : m === 1 ? "mês" : "meses"}`;
}

/**
 * Localised labels used by block-renderer for table headers, section captions,
 * empty-state messages and short units. Keyed by proposal language.
 */
export interface ProposalLabels {
  proposalCover: string;
  project: string;
  index: string;
  indexAuto: string;
  phase: string;
  start: string;
  end: string;
  duration: string;
  fees: string;
  totalArchitecture: string;
  scheduleUnavailable: string;
  noFeesToShow: string;
  noPhasesDefined: string;
  noConsultants: string;
  noPaymentSchedule: string;
  discipline: string;
  consultant: string;
  description: string;
  expectedDate: string;
  amount: string;
  deliverables: string;
  clientInfoRequired: string;
  scopeDeliverables: string;
  emptyEditRight: string;
  chooseStage: string;
  dayShort: string; // "d" / "d"
  weekShort: string; // "sem" / "wk"
  weeksShort: string; // "sems" / "wks"
  daysUnit: string; // "dias" / "days"
  refPrefix: string; // "Ref." / "Ref."
  noDesignPhases: string;
  noConstructionPhases: string;
  chooseParentInSettings: string;
  pageBreak: string;
  proposalValidity: string;
  clientSignatory: string;
  psaSignatory: string;
}

const LABELS_PT: ProposalLabels = {
  proposalCover: "Proposta de Honorários",
  project: "Projeto",
  index: "Índice",
  indexAuto: "O índice é gerado automaticamente a partir dos blocos visíveis.",
  phase: "Fase",
  start: "Início",
  end: "Fim",
  duration: "Duração",
  fees: "Honorários",
  totalArchitecture: "Total Arquitetura",
  scheduleUnavailable: "Sem cronograma disponível.",
  noFeesToShow: "Sem honorários para apresentar.",
  noPhasesDefined: "Sem fases definidas no orçamento.",
  noConsultants: "Sem consultores definidos.",
  noPaymentSchedule: "Sem plano de pagamentos definido.",
  discipline: "Especialidade",
  consultant: "Consultor",
  description: "Descrição",
  expectedDate: "Data prevista",
  amount: "Valor",
  deliverables: "Entregáveis",
  clientInfoRequired: "Informação necessária do cliente",
  scopeDeliverables: "Âmbito e entregáveis",
  emptyEditRight: "Sem conteúdo. Edite no painel direito.",
  chooseStage:
    "Selecione uma fase do orçamento no painel direito para preencher este bloco.",
  dayShort: "d",
  weekShort: "sem",
  weeksShort: "sems",
  daysUnit: "dias",
  refPrefix: "Ref.",
  noDesignPhases: "Sem fases de projeto com datas definidas.",
  noConstructionPhases: "Sem fases de obra com datas definidas.",
  chooseParentInSettings: "Selecione uma fase pai nas definições do bloco.",
  pageBreak: "Quebra de Página",
  proposalValidity:
    "A presente proposta é válida por 30 dias a contar da data acima. A aceitação far-se-á por assinatura abaixo.",
  clientSignatory: "Pelo Cliente",
  psaSignatory: "Pedra Silva Arquitectos",
};

const LABELS_EN: ProposalLabels = {
  proposalCover: "Fee Proposal",
  project: "Project",
  index: "Contents",
  indexAuto: "The table of contents is generated automatically from visible blocks.",
  phase: "Stage",
  start: "Start",
  end: "End",
  duration: "Duration",
  fees: "Fees",
  totalArchitecture: "Total Architecture",
  scheduleUnavailable: "No schedule available.",
  noFeesToShow: "No fees to display.",
  noPhasesDefined: "No stages defined in the quote.",
  noConsultants: "No consultants defined.",
  noPaymentSchedule: "No payment schedule defined.",
  discipline: "Discipline",
  consultant: "Consultant",
  description: "Description",
  expectedDate: "Expected date",
  amount: "Amount",
  deliverables: "Deliverables",
  clientInfoRequired: "Information required from the client",
  scopeDeliverables: "Scope and deliverables",
  emptyEditRight: "No content. Edit on the right panel.",
  chooseStage:
    "Select a quote stage on the right panel to populate this block.",
  dayShort: "d",
  weekShort: "wk",
  weeksShort: "wks",
  daysUnit: "days",
  refPrefix: "Ref.",
  noDesignPhases: "No design stages with defined dates.",
  noConstructionPhases: "No construction stages with defined dates.",
  chooseParentInSettings: "Select a parent stage in the block settings.",
  pageBreak: "Page Break",
  proposalValidity:
    "This proposal is valid for 30 days from the date above. Acceptance is confirmed by signature below.",
  clientSignatory: "For the Client",
  psaSignatory: "Pedra Silva Arquitectos",
};

export function getProposalLabels(lang: ProposalLang): ProposalLabels {
  return lang === "en" ? LABELS_EN : LABELS_PT;
}

export function formatMonthShort(d: Date, lang: ProposalLang): string {
  return d
    .toLocaleDateString(lang, { month: "short" })
    .replace(".", "");
}
