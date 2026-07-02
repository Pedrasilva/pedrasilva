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

export interface LiveStageResource {
  role: string;
  hours: number;
}

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
  resources: LiveStageResource[];
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
  paymentInvoices: Array<{
    key: string;
    label: string;
    plannedDate: string | null;
    lines: Array<{ description: string; net: number; vat: number }>;
    net: number;
    vat: number;
    total: number;
    paymentTerms: string | null;
  }>;
  paymentInvoicesTotal: { net: number; vat: number; total: number };
  defaultVatRate: number;
  missing: string[];
}

export function useLiveQuoteSnapshot(
  quoteId: string | null | undefined,
  lang: ProposalLang = "pt-PT",
) {
  return useQuery({
    enabled: !!quoteId,
    queryKey: ["psa-live-quote", quoteId, lang],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LiveQuoteSnapshot> => {
      const L = getProposalLabels(lang);
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
          "id,name,description,phase_code,start_date,end_date,budget,budget_mode,sort_order,is_self,is_milestone,parent_stage_id,supplier_id,supplier_company_id,supplier_placeholder",
        )
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("start_date", { ascending: true, nullsFirst: false });

      // Allocations per stage, joined to resource role labels, so we can
      // show a resource breakdown (director / senior architect / …) below
      // each stage's fee summary.
      const { data: allocs } = await supabase
        .from("quote_allocations")
        .select(
          "stage_id,start_date,end_date,hours_per_day,resource:pm_resources(proposal_role,billing_role,role,name)",
        )
        .eq("quote_id", quoteId!);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workingDaysBetween = (s: string | null, e: string | null): number => {
        if (!s || !e) return 0;
        const start = new Date(s);
        const end = new Date(e);
        let count = 0;
        const cur = new Date(start);
        while (cur <= end) {
          const d = cur.getDay();
          if (d !== 0 && d !== 6) count++;
          cur.setDate(cur.getDate() + 1);
        }
        return count;
      };

      const resourcesByStage = new Map<string, Map<string, number>>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of ((allocs ?? []) as any[])) {
        if (!a.stage_id) continue;
        const wd = workingDaysBetween(a.start_date, a.end_date);
        const hrs = wd * Number(a.hours_per_day || 0);
        if (hrs <= 0) continue;
        const r = a.resource ?? {};
        // Use only commercial / proposal roles — never person names.
        const roleLabel =
          (r.proposal_role as string | null) ||
          (r.billing_role as string | null) ||
          (r.role as string | null) ||
          "Team";

        const byRole = resourcesByStage.get(a.stage_id) ?? new Map<string, number>();
        byRole.set(roleLabel, (byRole.get(roleLabel) ?? 0) + hrs);
        resourcesByStage.set(a.stage_id, byRole);
      }



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
          "id,label,trigger_type,amount_type,amount_value,expected_invoice_date,sort_order,stage_id,direction,vat_rate,supplier_company_id,supplier_id,supplier_label,payment_terms",
        )
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("expected_invoice_date", { ascending: true, nullsFirst: false });

      // Resolve names for supplier companies referenced by payment items too.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paySupplierIds = Array.from(
        new Set(
          ((pay ?? []) as any[])
            .map((p) => p.supplier_company_id)
            .filter(Boolean),
        ),
      ) as string[];
      const missingSupplierIds = paySupplierIds.filter((id) => !supplierNames.has(id));
      if (missingSupplierIds.length) {
        const { data: sups2 } = await supabase
          .from("companies")
          .select("id,nome")
          .in("id", missingSupplierIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((sups2 ?? []) as any[]).forEach((s) => {
          if (s?.id && s?.nome) supplierNames.set(s.id, s.nome);
        });
      }

      if (!stages?.length) missing.push("stages");
      if (!pay?.length) missing.push("paymentSchedule");

      // ── Build client invoice list (mirrors the Incoming tab logic) ──
      const defaultVatRate = Number(q.default_vat_rate ?? 23) || 23;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stageArr = (stages ?? []) as any[];
      const stageById = new Map<string, { id: string; name: string; start_date: string | null; end_date: string | null; budget: number | null; parent_stage_id: string | null }>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stageArr.map((s: any) => [s.id, s]),
      );
      const totalFeeForPay =
        q.valor && Number(q.valor) > 0
          ? Number(q.valor)
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stageArr
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((s: any) => s.is_self !== false)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .reduce((sum: number, s: any) => sum + (Number(s.budget) || 0), 0);
      const stageFees: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stageArr.forEach((s: any) => { stageFees[s.id] = Number(s.budget) || 0; });

      const rootOf = (stageId: string | null | undefined) => {
        if (!stageId) return null;
        let cur = stageById.get(stageId) ?? null;
        const seen = new Set<string>();
        while (cur && cur.parent_stage_id) {
          if (seen.has(cur.parent_stage_id)) break;
          seen.add(cur.parent_stage_id);
          const p = stageById.get(cur.parent_stage_id);
          if (!p) break;
          cur = p;
        }
        return cur;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolveAmount = (p: any): number => {
        const value = Number(p.amount_value ?? 0);
        if (p.amount_type === "fixed") return value;
        if ((p.trigger_type === "stage_start" || p.trigger_type === "stage_end") && p.stage_id && stageFees[p.stage_id] != null) {
          return (stageFees[p.stage_id] * value) / 100;
        }
        return (totalFeeForPay * value) / 100;
      };

      const fmtDate = (iso?: string | null) => {
        if (!iso) return "";
        const [y, m, d] = iso.split("-");
        return y && m && d ? `${d}/${m}/${y}` : iso;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dateFor = (p: any): string => {
        if (p.expected_invoice_date) return p.expected_invoice_date;
        const s = p.stage_id ? stageById.get(p.stage_id) : null;
        if (p.trigger_type === "stage_start") return s?.start_date ?? "9999-12-31";
        return s?.end_date ?? "9999-12-31";
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const triggerSentence = (p: any): string => {
        const s = p.stage_id ? stageById.get(p.stage_id) : null;
        const stageName = s?.name ?? "";
        const ds = fmtDate(dateFor(p));
        switch (p.trigger_type) {
          case "project_start": return `${L.atProjectStart}${ds ? ` (${ds})` : ""}`;
          case "stage_start": return stageName ? `${L.atStartOf} ${stageName}${ds ? ` (${ds})` : ""}` : `${L.atStartOfStage}${ds ? ` (${ds})` : ""}`;
          case "stage_end": return stageName ? `${L.uponCompletionOf} ${stageName}${ds ? ` (${ds})` : ""}` : `${L.uponCompletionOfStage}${ds ? ` (${ds})` : ""}`;
          case "manual_date": return `${L.onDate} ${ds || L.dateTBD}`;
          case "monthly": return stageName ? `${L.monthlyOf} ${stageName}${ds ? ` (${ds})` : ""}` : (p.label || `${L.monthly}${ds ? ` (${ds})` : ""}`);
          default: return p.label ?? "";
        }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serviceOf = (p: any): { key: string; name: string; isSupplier: boolean } => {
        if (p.supplier_company_id) {
          return { key: `c:${p.supplier_company_id}`, name: supplierNames.get(p.supplier_company_id) ?? p.supplier_label ?? L.supplierFallback, isSupplier: true };
        }
        if (p.supplier_id) {
          return { key: `s:${p.supplier_id}`, name: supplierNames.get(p.supplier_id) ?? p.supplier_label ?? L.supplierFallback, isSupplier: true };
        }
        if (p.supplier_label && String(p.supplier_label).trim()) {
          return { key: `p:${String(p.supplier_label).trim().toLowerCase()}`, name: String(p.supplier_label).trim(), isSupplier: true };
        }
        const root = rootOf(p.stage_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rootRole = (root as any)?.stage_role as string | undefined;
        if (rootRole === "supplier_group" || rootRole === "supplier_phase") {
          return { key: `r:${root!.id}`, name: root!.name, isSupplier: true };
        }
        return { key: `arch:${root?.id ?? "_"}`, name: root && rootRole !== "supplier_group" && rootRole !== "supplier_phase" ? root.name : L.architectureFallback, isSupplier: false };
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inflows = ((pay ?? []) as any[]).filter(
        (p) => (p.direction ?? "inflow") === "inflow" && p.trigger_type !== "project_start",
      );
      type Invoice = { key: string; plannedDate: string; items: any[]; paymentTerms: string | null };
      const invoiceMap = new Map<string, Invoice>();
      const orderKeys: string[] = [];
      for (const it of inflows) {
        const d = dateFor(it);
        const ym = d.length >= 7 ? d.slice(0, 7) : d;
        const key = `m:${ym}`;
        let inv = invoiceMap.get(key);
        if (!inv) {
          inv = { key, plannedDate: d, items: [], paymentTerms: it.payment_terms ?? null };
          invoiceMap.set(key, inv);
          orderKeys.push(key);
        } else if (d > inv.plannedDate) {
          inv.plannedDate = d;
        }
        inv.items.push(it);
        if (!inv.paymentTerms && it.payment_terms) inv.paymentTerms = it.payment_terms;
      }
      orderKeys.sort((a, b) => {
        const da = invoiceMap.get(a)!.plannedDate;
        const db = invoiceMap.get(b)!.plannedDate;
        return da < db ? -1 : da > db ? 1 : 0;
      });

      const paymentInvoices = orderKeys.map((k, gi) => {
        const inv = invoiceMap.get(k)!;
        const groups = new Map<string, { svc: { key: string; name: string; isSupplier: boolean }; rows: any[] }>();
        const gorder: string[] = [];
        for (const it of inv.items) {
          const svc = serviceOf(it);
          if (!groups.has(svc.key)) { groups.set(svc.key, { svc, rows: [] }); gorder.push(svc.key); }
          groups.get(svc.key)!.rows.push(it);
        }
        gorder.sort((a, b) => (groups.get(a)!.svc.isSupplier ? 1 : 0) - (groups.get(b)!.svc.isSupplier ? 1 : 0));
        const lines = gorder.map((gk) => {
          const { svc, rows } = groups.get(gk)!;
          const net = rows.reduce((s, r) => s + resolveAmount(r), 0);
          const vatAmt = rows.reduce((s, r) => {
            const n = resolveAmount(r);
            const v = Number(r.vat_rate ?? defaultVatRate);
            return s + (n * v) / 100;
          }, 0);
          const head = rows[0];
          const stageNames = Array.from(
            new Set(rows.map((r) => (r.stage_id ? stageById.get(r.stage_id)?.name : null)).filter(Boolean)),
          ) as string[];
          const desc = stageNames.length > 1
            ? `${svc.name} — ${stageNames.join(" + ")} (${fmtDate(inv.plannedDate)})`
            : `${svc.name} — ${triggerSentence(head)}`;
          return { description: desc, net, vat: vatAmt };
        });
        const net = lines.reduce((s, l) => s + l.net, 0);
        const vat = lines.reduce((s, l) => s + l.vat, 0);
        return {
          key: inv.key,
          label: `${L.invoiceAbbr} ${String(gi + 1).padStart(2, "0")}`,
          plannedDate: inv.plannedDate,
          lines,
          net,
          vat,
          total: net + vat,
          paymentTerms: inv.paymentTerms,
        };
      });
      const paymentInvoicesTotal = paymentInvoices.reduce(
        (acc, i) => ({ net: acc.net + i.net, vat: acc.vat + i.vat, total: acc.total + i.total }),
        { net: 0, vat: 0, total: 0 },
      );

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
            resources: Array.from(
              (resourcesByStage.get(s.id) ?? new Map<string, number>()).entries(),
            )
              .map(([role, hours]) => ({ role, hours: Math.round(hours * 10) / 10 }))
              .sort((a, b) => b.hours - a.hours),
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
        paymentInvoices,
        paymentInvoicesTotal,
        defaultVatRate,
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
  resourceBreakdown: string;
  role: string;
  hours: string;
  hoursShort: string;
  invoiceCol: string;
  invoiceAbbr: string;
  dateCol: string;
  netCol: string;
  vatCol: string;
  grossCol: string;
  subtotal: string;
  total: string;
  monthlyOf: string;
  monthly: string;
  atProjectStart: string;
  atStartOf: string;
  atStartOfStage: string;
  uponCompletionOf: string;
  uponCompletionOfStage: string;
  onDate: string;
  dateTBD: string;
  supplierFallback: string;
  architectureFallback: string;

  emptyEditRight: string;
  chooseStage: string;
  dayShort: string; // "d" / "d"
  weekShort: string; // "sem" / "wk"
  weeksShort: string; // "sems" / "wks"
  monthShort: string; // "mês" / "mo"
  monthsShort: string; // "meses" / "mos"
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
  resourceBreakdown: "Recursos afectos",
  role: "Função",
  hours: "Horas",
  hoursShort: "h",
  invoiceCol: "Fatura",
  invoiceAbbr: "FT",
  dateCol: "Data",
  netCol: "Sem IVA",
  vatCol: "IVA",
  grossCol: "Com IVA",
  subtotal: "Subtotal",
  total: "Total",
  monthlyOf: "Mensalidade de",
  monthly: "Mensalidade",
  atProjectStart: "No início do projecto",
  atStartOf: "No início de",
  atStartOfStage: "No início da fase",
  uponCompletionOf: "Na conclusão de",
  uponCompletionOfStage: "Na conclusão da fase",
  onDate: "Em",
  dateTBD: "data a definir",
  supplierFallback: "Fornecedor",
  architectureFallback: "Arquitectura",

  emptyEditRight: "Sem conteúdo. Edite no painel direito.",
  chooseStage:
    "Selecione uma fase do orçamento no painel direito para preencher este bloco.",
  dayShort: "d",
  weekShort: "sem",
  weeksShort: "sems",
  monthShort: "mês",
  monthsShort: "meses",
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
  resourceBreakdown: "Allocated resources",
  role: "Role",
  hours: "Hours",
  hoursShort: "h",
  invoiceCol: "Invoice",
  invoiceAbbr: "INV",
  dateCol: "Date",
  netCol: "Net",
  vatCol: "VAT",
  grossCol: "Gross",
  subtotal: "Subtotal",
  total: "Total",
  monthlyOf: "Monthly fee for",
  monthly: "Monthly fee",
  atProjectStart: "At project start",
  atStartOf: "At the start of",
  atStartOfStage: "At the start of the stage",
  uponCompletionOf: "Upon completion of",
  uponCompletionOfStage: "Upon completion of the stage",
  onDate: "On",
  dateTBD: "date to be defined",
  supplierFallback: "Supplier",
  architectureFallback: "Architecture",


  emptyEditRight: "No content. Edit on the right panel.",
  chooseStage:
    "Select a quote stage on the right panel to populate this block.",
  dayShort: "d",
  weekShort: "wk",
  weeksShort: "wks",
  monthShort: "mo",
  monthsShort: "mos",
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

/**
 * Single-unit duration formatter used across all proposal blocks.
 * Rule:
 * - ≤ 7 days           → days
 * - > 7 days, ≤ 4 wks  → weeks
 * - > 4 weeks          → months
 */
export function formatDurationHuman(
  days: number | null | undefined,
  lang: ProposalLang,
): string {
  if (days == null || !isFinite(days)) return "—";
  const L = getProposalLabels(lang);
  const d = Math.max(0, Math.round(days));
  if (d <= 7) return `${d} ${d === 1 ? L.dayShort : L.daysUnit}`;
  if (d <= 28) {
    const w = Math.round(d / 7);
    return `${w} ${w === 1 ? L.weekShort : L.weeksShort}`;
  }
  const m = Math.max(1, Math.round(d / 30));
  return `${m} ${m === 1 ? L.monthShort : L.monthsShort}`;
}

// Backwards-compat alias: identical single-unit output.
export const formatDurationCompact = formatDurationHuman;



