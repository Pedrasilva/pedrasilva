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
import { useFrozenQuoteSnapshot } from "./revision-context";
import { supabase } from "@/integrations/supabase/client";

import {
  resolveSupplierMarkupPct,
  type SupplierMarkupRow,
} from "@/lib/quotes/supplier-markup-lookup";
import { type Collaborator, type Snapshot, computeSnapshot } from "@/lib/salary";
import { computePricing, cotaBoPorColabProjecto } from "@/lib/pricing";
import { computeCollaboratorFte, effectiveDailyHours } from "@/lib/hr/fte";

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
  /** Raw stage budget before any admin markup — same as `fee` when no
   *  supplier admin markup applies. Preserved so downstream consumers
   *  can still see the pre-markup number when needed. */
  rawFee: number | null;
  /** Supplier admin markup percentage inherited from the stage's group
   *  root (0 when no supplier or no markup configured). */
  supplierMarkupPct: number;
  hours: number | null;
  isSelf: boolean;
  isMilestone: boolean;
  isOptional: boolean;
  /** quote_stages.stage_role — e.g. "architecture", "supplier_group", "client". */
  stageRole: string | null;
  parentStageId: string | null;
  sortOrder: number | null;
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
    /** Client-billed fee = supplierFee × (1 + admin markup pct). */
    fee: number | null;
    /** Raw supplier fee, before the admin markup is applied. */
    supplierFee: number | null;
    /** Admin markup percentage applied (0 when none). */
    supplierMarkupPct: number;
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
  /** True when the quote's build settings mark it VAT-exempt. */
  vatExempt: boolean;
  defaultVatRate: number;


  siteTrips: Array<{
    id: string;
    label: string;
    stageId: string | null;
    stageName: string | null;
    stageNumber: string | null;
    km: number;
    pricePerKm: number;
    tripHours: number;
    hourlyRate: number;
    frequencyMode: "per_month" | "total";
    frequencyValue: number;
    stageMonths: number | null;
    durationMonthsOverride: number | null;
    totalTrips: number;
    perTripKmCost: number;
    perTripHrCost: number;
    perTripTotal: number;
    totalCost: number;
    resourceNames: string[];
    notes: string | null;
  }>;
  siteTripsTotal: number;
  /**
   * Billable hourly rates catalog for this quote — one entry per active
   * proposal role, sorted by sale rate descending. `saleRate` comes from
   * the quote-scoped `quote_billable_hourly_rates` override; `hourlyRate`
   * is the shared cost from the `proposal_roles` catalog.
   */
  billableRates: Array<{
    code: string;
    label_pt: string;
    label_en: string;
    hourlyRate: number;
    saleRate: number;
  }>;
  missing: string[];
  /**
   * Which document version this payload represents. Live/draft rendering
   * leaves `number`/`sentAt` null; historical revision rendering fills them
   * from the stored revision record.
   */
  revision: {
    number: number | null;
    sentAt: string | null;
    isDraft: boolean;
  };

}

/**
 * Build the consultant rows for the Consultants block.
 *
 * A "consultant" is a supplier engaged for a stage subtree in the Gantt
 * (non-self stages). We group by the grandparent — i.e. the topmost
 * ancestor that carries the supplier assignment — so that nested stages
 * assigned to the same supplier collapse into a single row.
 *
 * Rules:
 *  - Walk up each stage's ancestors; the "group root" is the topmost
 *    ancestor that shares the same supplier key. If no ancestor is
 *    tagged, the stage itself is the group root.
 *  - Discipline = group root stage.name.
 *  - Consultant name = supplier company / pm_supplier / placeholder.
 *  - Fee = group root's budget when set; otherwise sum of the subtree
 *    budgets.
 *  - Legacy quote_external_services entries are kept as-is (they have no
 *    stage grouping).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildConsultantRows(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalServices: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stages: any[];
  stageById: Map<string, { id: string; parent_stage_id: string | null; budget: number | null }>;
  supplierNames: Map<string, string>;
  pmSupplierNames: Map<string, string>;
  supplierMarkups: SupplierMarkupRow[];
}): LiveQuoteSnapshot["consultants"] {
  const { externalServices, stages, supplierNames, pmSupplierNames, supplierMarkups } = input;

  type Stage = {
    id: string;
    name: string;
    parent_stage_id: string | null;
    is_self: boolean | null;
    is_optional: boolean | null;
    budget: number | null;
    budget_mode: string | null;
    supplier_id: string | null;
    supplier_company_id: string | null;
    supplier_placeholder: string | null;
  };
  const sById = new Map<string, Stage>(stages.map((s) => [s.id, s as Stage]));
  const supplierKey = (s: Stage): string | null => {
    if (s.supplier_company_id) return `co:${s.supplier_company_id}`;
    if (s.supplier_id) return `pm:${s.supplier_id}`;
    const ph = (s.supplier_placeholder ?? "").trim();
    if (ph) return `ph:${ph.toLowerCase()}`;
    return null;
  };
  const supplierLabel = (s: Stage): string | null => {
    if (s.supplier_company_id)
      return supplierNames.get(s.supplier_company_id) ?? null;
    if (s.supplier_id) return pmSupplierNames.get(s.supplier_id) ?? null;
    const ph = (s.supplier_placeholder ?? "").trim();
    return ph || null;
  };

  // For each stage carrying a supplier, walk up to the topmost ancestor
  // that shares the same supplier key — that ancestor is the "grandparent"
  // group root.
  const groupRootFor = (stage: Stage): Stage => {
    const key = supplierKey(stage);
    if (!key) return stage;
    let top = stage;
    let cur: Stage | undefined = stage.parent_stage_id
      ? sById.get(stage.parent_stage_id)
      : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (supplierKey(cur) === key) top = cur;
      cur = cur.parent_stage_id ? sById.get(cur.parent_stage_id) : undefined;
    }
    return top;
  };

  // A stage is treated as optional (and excluded from the consultants
  // block) when it OR any ancestor has is_optional=true.
  const isOptionalWithAncestors = (stage: Stage): boolean => {
    let cur: Stage | undefined = stage;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      if (cur.is_optional === true) return true;
      seen.add(cur.id);
      cur = cur.parent_stage_id ? sById.get(cur.parent_stage_id) : undefined;
    }
    return false;
  };

  // Collect descendants of a stage (inclusive).
  const childrenByParent = new Map<string, Stage[]>();
  for (const s of sById.values()) {
    if (!s.parent_stage_id) continue;
    const arr = childrenByParent.get(s.parent_stage_id) ?? [];
    arr.push(s);
    childrenByParent.set(s.parent_stage_id, arr);
  }
  const subtreeBudget = (rootId: string): number => {
    let total = 0;
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      const st = sById.get(id);
      if (!st) continue;
      const kids = childrenByParent.get(id) ?? [];
      if (kids.length === 0) {
        total += Number(st.budget) || 0;
      } else {
        for (const k of kids) stack.push(k.id);
      }
    }
    return total;
  };

  const groups = new Map<
    string,
    LiveQuoteSnapshot["consultants"][number]
  >();
  for (const s of sById.values()) {
    if (s.is_self === true) continue;
    if (!supplierKey(s)) continue;
    if (isOptionalWithAncestors(s)) continue;
    const root = groupRootFor(s);
    if (isOptionalWithAncestors(root)) continue;
    const key = `${root.id}:${supplierKey(root) ?? ""}`;
    if (groups.has(key)) continue;
    const ownBudget = Number(root.budget) || 0;
    const supplierFee =
      root.budget_mode === "fixed" && ownBudget > 0
        ? ownBudget
        : subtreeBudget(root.id) || ownBudget || null;
    const pct = resolveSupplierMarkupPct(
      {
        supplier_company_id: root.supplier_company_id,
        supplier_id: root.supplier_id,
        supplier_label: root.supplier_placeholder ?? null,
      },
      supplierMarkups,
    );
    const fee = supplierFee == null ? null : supplierFee * (1 + pct / 100);
    groups.set(key, {
      id: `stage-${root.id}`,
      name: supplierLabel(root) ?? "—",
      discipline: root.name ?? null,
      fee,
      supplierFee,
      supplierMarkupPct: pct,
    });
  }

  // Legacy free-form external services (kept as-is).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyRows: LiveQuoteSnapshot["consultants"] = (externalServices as any[]).map((c) => {
    const supplierFee = (c.sale_price ?? null) as number | null;
    const pct = resolveSupplierMarkupPct(
      {
        supplier_company_id: c.supplier_company_id ?? null,
        supplier_id: c.supplier_id ?? null,
        supplier_label: c.description ?? null,
      },
      supplierMarkups,
    );
    const fee = supplierFee == null ? null : supplierFee * (1 + pct / 100);
    return {
      id: c.id as string,
      name:
        (c.supplier_company_id && supplierNames.get(c.supplier_company_id)) ||
        (c.supplier_id && pmSupplierNames.get(c.supplier_id)) ||
        c.description ||
        "—",
      discipline: (c.description ?? null) as string | null,
      fee,
      supplierFee,
      supplierMarkupPct: pct,
    };
  });

  return [...groups.values(), ...legacyRows];
}


/**
 * Fetches and resolves the full quote payload used by every proposal block.
 * Exported so revision snapshotting can freeze the exact same object.
 */
export async function fetchLiveQuoteSnapshot(
  quoteId: string,
  lang: ProposalLang = "pt-PT",
): Promise<LiveQuoteSnapshot> {
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
          "id,name,description,phase_code,start_date,end_date,budget,budget_mode,sort_order,is_self,is_milestone,is_optional,stage_role,parent_stage_id,supplier_id,supplier_company_id,supplier_placeholder",
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

      // Also resolve supplier names for stage-level assignments (pm_suppliers
      // for supplier_id, companies for supplier_company_id).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stagesArr0 = (stages ?? []) as any[];
      const stageCompanyIds = Array.from(
        new Set(
          stagesArr0.map((s) => s.supplier_company_id).filter(Boolean),
        ),
      ) as string[];
      const stagePmSupplierIds = Array.from(
        new Set(stagesArr0.map((s) => s.supplier_id).filter(Boolean)),
      ) as string[];
      const missingCompanyIds = stageCompanyIds.filter((id) => !supplierNames.has(id));
      if (missingCompanyIds.length) {
        const { data: sups3 } = await supabase
          .from("companies")
          .select("id,nome")
          .in("id", missingCompanyIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((sups3 ?? []) as any[]).forEach((s) => {
          if (s?.id && s?.nome) supplierNames.set(s.id, s.nome);
        });
      }
      const pmSupplierNames = new Map<string, string>();
      if (stagePmSupplierIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pms } = await (supabase as any)
          .from("pm_suppliers")
          .select("id,name")
          .in("id", stagePmSupplierIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((pms ?? []) as any[]).forEach((s) => {
          if (s?.id && s?.name) pmSupplierNames.set(s.id, s.name);
        });
      }

      // Per-supplier admin markup (applied to client-billed supplier prices).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: supplierMarkupRows } = await (supabase as any)
        .from("quote_supplier_markups")
        .select("supplier_company_id,supplier_id,supplier_label,markup_pct")
        .eq("quote_id", quoteId!);
      const supplierMarkups: SupplierMarkupRow[] = (
        (supplierMarkupRows ?? []) as SupplierMarkupRow[]
      ).map((r) => ({
        supplier_company_id: r.supplier_company_id ?? null,
        supplier_id: r.supplier_id ?? null,
        supplier_label: r.supplier_label ?? null,
        markup_pct: Number(r.markup_pct) || 0,
      }));

      // ── Site trips (Construction Assistance) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: siteTripsRaw } = await (supabase as any)
        .from("quote_site_trips")
        .select(
          "id,label,stage_id,km,price_per_km,trip_hours,resource_id,resource_ids,resource_hourly_rates,resource_hourly_rate,frequency_mode,frequency_value,duration_months_override,display_mode,notes,sort_order",
        )
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      // Collect all resource ids we need to look up (both from trips and stage allocations).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tripResourceIds = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((siteTripsRaw ?? []) as any[]).forEach((t) => {
        (t.resource_ids ?? []).forEach((id: string) => id && tripResourceIds.add(id));
        if (t.resource_id) tripResourceIds.add(t.resource_id);
      });
      const resourceRateById = new Map<string, number>();
      const resourceNameById = new Map<string, string>();
      /** Raw role code as stored on the resource / collaborator (e.g. `lead_designer`). */
      const resourceRoleCodeById = new Map<string, string>();
      if (tripResourceIds.size) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: resRows } = await (supabase as any)
          .from("pm_resources")
          .select("id,name,hourly_rate,proposal_role,billing_role,role,collaborator_id")
          .in("id", Array.from(tripResourceIds));
        const missingRoleCollabIds = new Set<string>();
        const collabIdByResource = new Map<string, string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((resRows ?? []) as any[]).forEach((r) => {
          if (!r?.id) return;
          resourceRateById.set(r.id, Number(r.hourly_rate) || 0);
          const role =
            (r.proposal_role as string | null) ||
            (r.billing_role as string | null) ||
            (r.role as string | null) ||
            "";
          if (role) {
            resourceRoleCodeById.set(r.id, String(role));
          } else if (r.collaborator_id) {
            collabIdByResource.set(r.id, String(r.collaborator_id));
            missingRoleCollabIds.add(String(r.collaborator_id));
          }
          const name = (r.name as string | null) || "";
          if (name) resourceNameById.set(r.id, String(name));
        });
        // Fall back to the linked collaborator's proposal_role / billing_role
        // when the pm_resource row itself has none set.
        if (missingRoleCollabIds.size) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: collabRows } = await (supabase as any)
            .from("collaborators")
            .select("id,proposal_role,billing_role")
            .in("id", Array.from(missingRoleCollabIds));
          const roleByCollabId = new Map<string, string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((collabRows ?? []) as any[]).forEach((c) => {
            if (!c?.id) return;
            const role =
              (c.proposal_role as string | null) ||
              (c.billing_role as string | null) ||
              "";
            if (role) roleByCollabId.set(String(c.id), String(role));
          });
          for (const [resId, collabId] of collabIdByResource) {
            const code = roleByCollabId.get(collabId);
            if (code) resourceRoleCodeById.set(resId, code);
          }
        }
      }
      /** Legacy: display label for role. Filled after the proposal_roles
       *  catalog is loaded below (see `roleLabelByCode`). */
      const resourceRoleById = new Map<string, string>();




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
          case "project_start":
            return String(p.label ?? "").toLowerCase().startsWith("adjudicação")
              ? `${L.downpaymentReceived}${ds ? ` (${ds})` : ""}`
              : `${p.label || L.downpaymentReceived}${ds ? ` (${ds})` : ""}`;

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

      // Honor per-quote build settings: if downpayment is disabled or 0%,
      // hide any lingering project_start rows from the proposal view even
      // when the payment schedule hasn't been re-synced yet. Also honor
      // the VAT toggle — VAT-exempt proposals zero out all VAT amounts.
      const buildSettings = (q.quote_build_settings ?? {}) as {
        downPaymentEnabled?: boolean;
        downPaymentPercent?: number;
        vatEnabled?: boolean;
      };
      const dpDisabled =
        buildSettings.downPaymentEnabled === false ||
        Number(buildSettings.downPaymentPercent ?? 0) === 0;
      const vatExempt = buildSettings.vatEnabled === false;
      // Client-approval stages have no financial impact — filter their
      // payment rows out entirely (they show as €0 lines otherwise).
      const clientStageIds = new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stageArr.filter((s: any) => s.stage_role === "client").map((s: any) => s.id as string),
      );
      // Only the generated down payment ("Adjudicação") is hidden when the down
      // payment is switched off. Project-level billing rows also fire at
      // project_start (e.g. "50% — Início de Projeto") and must stay visible.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isAdjudicacaoRow = (p: any) =>
        p.trigger_type === "project_start" &&
        String(p.label ?? "").toLowerCase().startsWith("adjudicação");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inflows = ((pay ?? []) as any[]).filter(
        (p) =>
          (p.direction ?? "inflow") === "inflow" &&
          !(dpDisabled && isAdjudicacaoRow(p)) &&
          !(p.stage_id && clientStageIds.has(p.stage_id)),
      );


      type Invoice = { key: string; plannedDate: string; items: any[]; paymentTerms: string | null };
      const invoiceMap = new Map<string, Invoice>();
      const orderKeys: string[] = [];
      for (const it of inflows) {
        const d = dateFor(it);
        // Each distinct billing event gets its own invoice row: down payments,
        // stage-start, stage-end, split, monthly slices etc. Grouping by month
        // previously merged e.g. "end of Stage 1" with "start of Stage 2" when
        // both fell in the same month, hiding the child-level billing choices.
        const isDownpayment = it.trigger_type === "project_start";
        const key = isDownpayment
          ? `dp:${d}`
          : `t:${it.trigger_type ?? "x"}:${d}`;
        let inv = invoiceMap.get(key);
        if (!inv) {
          inv = { key, plannedDate: d, items: [], paymentTerms: it.payment_terms ?? null };
          invoiceMap.set(key, inv);
          orderKeys.push(key);
        } else if (!isDownpayment && d > inv.plannedDate) {
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
          const vatAmt = vatExempt
            ? 0
            : rows.reduce((s, r) => {
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

      // ── Billable hourly rates catalog (proposal_roles + quote overrides) ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roleRows } = await (supabase as any)
        .from("proposal_roles")
        .select("code,label_pt,label_en,hourly_rate,sort_order,archived_at")
        .is("archived_at", null)
        .order("sort_order", { ascending: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: saleRows } = await (supabase as any)
        .from("quote_billable_hourly_rates")
        .select("role_name,sale_rate")
        .eq("quote_id", quoteId!);
      const saleByCode = new Map<string, number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((saleRows ?? []) as any[]).forEach((r) => {
        if (r?.role_name)
          saleByCode.set(String(r.role_name), Number(r.sale_rate) || 0);
      });

      // Derive per-role cost from HR (collaborators + salary snapshots +
      // bo_settings) using the same model as HR › Pricing. Group each
      // collaborator's computed cost/hour by their proposal_role and average.
      const costByRoleCode = new Map<string, number>();
      try {
        const [collabRes, snapRes, boRes] = await Promise.all([
          supabase.from("collaborators").select("*").is("archived_at", null),
          supabase.from("salary_snapshots").select("*").eq("is_effective", true),
          supabase.from("bo_settings").select("*").limit(1).maybeSingle(),
        ]);
        const collabs = (collabRes.data ?? []) as Collaborator[];
        const snapshots = (snapRes.data ?? []) as Snapshot[];
        const bo = boRes.data as {
          custos_operacionais_anual?: number;
          dias_uteis?: number;
          horas_dia?: number;
          margem_lucro_pct?: number;
        } | null;
        const custosOp = Number(bo?.custos_operacionais_anual ?? 0);
        const diasUteis = Number(bo?.dias_uteis ?? 220);
        const horasDia = Number(bo?.horas_dia ?? 8);
        const margemDefault = Number(bo?.margem_lucro_pct) || 0.5;
        const projecto = collabs.filter((c) => c.departamento === "Projecto");
        const backoffice = collabs.filter((c) => c.departamento === "Backoffice");
        const vbgFor = (c: Collaborator): number => {
          const s = snapshots.find((sn) => sn.collaborator_id === c.id);
          return s ? computeSnapshot(s).custoVBG : 0;
        };
        const totalBackofficeVbg = backoffice.reduce((a, c) => a + vbgFor(c), 0);
        const fteTotalProjecto = projecto.reduce(
          (a, c) => a + computeCollaboratorFte(c.daily_hours, c.days_per_week, horasDia),
          0,
        );
        const cotaBo = cotaBoPorColabProjecto({
          custosOperacionais: custosOp,
          custoBackofficeVbg: totalBackofficeVbg,
          numColabProjecto: projecto.length,
          fteTotalProjecto,
        });
        const roleAgg = new Map<string, { sum: number; n: number }>();
        for (const c of projecto) {
          const roleCode =
            (c.proposal_role as string | null) ||
            (c.billing_role as string | null) ||
            "";
          if (!roleCode) continue;
          const vbg = vbgFor(c);
          if (!vbg) continue;
          const collabHorasDia = effectiveDailyHours(c.daily_hours, horasDia);
          const fte = computeCollaboratorFte(c.daily_hours, c.days_per_week, horasDia);
          const chargeability =
            c.target_chargeability_pct != null
              ? Number(c.target_chargeability_pct) / 100
              : undefined;
          const marginPct = c.margem_lucro_pct_override ?? margemDefault;
          const p = computePricing({
            vbgColaborador: vbg,
            cotaBoAnual: cotaBo * fte,
            diasUteis,
            horasDia: collabHorasDia,
            margemLucroPct: marginPct,
            chargeabilityPct: chargeability,
          });
          const cur = roleAgg.get(roleCode) ?? { sum: 0, n: 0 };
          cur.sum += p.custoHoraDesperdicio;
          cur.n += 1;
          roleAgg.set(roleCode, cur);
        }
        for (const [code, { sum, n }] of roleAgg) {
          if (n > 0) costByRoleCode.set(code, sum / n);
        }
      } catch {
        // HR access may be restricted for some users — fall back silently.
      }

      const billableRates = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((roleRows ?? []) as any[]).map((r) => {
          const code = String(r.code ?? "");
          const catalogCost = Number(r.hourly_rate) || 0;
          const hrCost = costByRoleCode.get(code) ?? 0;
          const cost = catalogCost > 0 ? catalogCost : hrCost;
          // Default sale rate = cost × 2 (100% markup). Per-quote manual
          // override still wins when set.
          const override = saleByCode.get(code);
          const saleRate = override != null && override > 0 ? override : cost * 2;
          return {
            code,
            label_pt: String(r.label_pt ?? r.code ?? ""),
            label_en: String(r.label_en ?? r.code ?? ""),
            hourlyRate: cost,
            saleRate,
          };
        })
      ).sort((a, b) => b.saleRate - a.saleRate);

      // Resolve each resource's role code to its localized display label
      // using the proposal_roles catalog. Falls back to the raw code so
      // nothing ever renders blank.
      const roleLabelByCode = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((roleRows ?? []) as any[]).forEach((r) => {
        const code = String(r.code ?? "");
        if (!code) return;
        const label = lang === "en"
          ? String(r.label_en ?? r.label_pt ?? code)
          : String(r.label_pt ?? r.label_en ?? code);
        roleLabelByCode.set(code, label);
      });
      for (const [resId, code] of resourceRoleCodeById) {
        resourceRoleById.set(resId, roleLabelByCode.get(code) ?? code);
      }




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
        stages: (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stageArr = (stages ?? []) as any[];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const byId = new Map<string, any>(stageArr.map((s) => [s.id, s]));
          // Walk ancestors to find the closest supplier assignment; return
          // the admin markup pct for that supplier (0 when none).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const markupForStage = (s: any): number => {
            const seen = new Set<string>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let cur: any = s;
            while (cur && !seen.has(cur.id)) {
              seen.add(cur.id);
              if (
                cur.supplier_company_id ||
                cur.supplier_id ||
                (cur.supplier_placeholder ?? "").trim()
              ) {
                return resolveSupplierMarkupPct(
                  {
                    supplier_company_id: cur.supplier_company_id ?? null,
                    supplier_id: cur.supplier_id ?? null,
                    supplier_label: cur.supplier_placeholder ?? null,
                  },
                  supplierMarkups,
                );
              }
              cur = cur.parent_stage_id ? byId.get(cur.parent_stage_id) : null;
            }
            return 0;
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return stageArr.map((s: any) => {
            const start = s.start_date ? new Date(s.start_date) : null;
            const end = s.end_date ? new Date(s.end_date) : null;
            let days: number | null = null;
            if (start && end) {
              // Calendar days (inclusive of start and end) so the value
              // matches what the Gantt bar shows to the client. Using
              // workday counts under-reports duration and can flip a
              // 14-day stage down to "1 wk".
              const ms = end.getTime() - start.getTime();
              const calendarDays = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
              days = Math.max(1, calendarDays);
            }
            const rawFee = s.budget ?? null;
            // Only supplier stages (non-self) receive the admin markup.
            const pct = s.is_self === false ? markupForStage(s) : 0;
            const fee =
              rawFee == null ? null : (Number(rawFee) || 0) * (1 + pct / 100);
            return {
              id: s.id,
              name: s.name,
              code: s.phase_code ?? null,
              description: s.description ?? null,
              startDate: s.start_date,
              endDate: s.end_date,
              durationDays: days,
              fee,
              rawFee,
              supplierMarkupPct: pct,
              hours: null,
              isSelf: s.is_self !== false,
              isMilestone: s.is_milestone === true,
              isOptional: s.is_optional === true,
              stageRole: (s as { stage_role?: string | null }).stage_role ?? null,
              parentStageId: s.parent_stage_id ?? null,
              sortOrder: s.sort_order ?? null,
              resources: Array.from(
                (resourcesByStage.get(s.id) ?? new Map<string, number>()).entries(),
              )
                .map(([role, hours]) => ({ role, hours: Math.round(hours * 10) / 10 }))
                .sort((a, b) => b.hours - a.hours),
            };
          });
        })(),

        consultants: buildConsultantRows({
          externalServices: ext ?? [],
          stages: stagesArr0,
          stageById,
          supplierNames,
          pmSupplierNames,
          supplierMarkups,
        }),
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
        vatExempt,

        ...(() => {
          // Build siteTrips with pre-computed costs. Stage duration comes
          // from the stage date range (working days ≈ (end - start) / 30.44).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stageArrFinal = (stages ?? []) as any[];
          const stageByIdLocal = new Map<string, { id: string; name: string; start_date: string | null; end_date: string | null; parent_stage_id: string | null; sort_order: number | null }>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stageArrFinal.forEach((s: any) => stageByIdLocal.set(s.id, s));
          const stageNumberMap = (() => {
            const childrenBy = new Map<string | null, typeof stageArrFinal>();
            for (const s of stageArrFinal) {
              const p = s.parent_stage_id && stageByIdLocal.has(s.parent_stage_id) ? s.parent_stage_id : null;
              const arr = childrenBy.get(p) ?? [];
              arr.push(s);
              childrenBy.set(p, arr);
            }
            for (const arr of childrenBy.values()) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              arr.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            }
            const m = new Map<string, string>();
            const walk = (parentId: string | null, prefix: number[]) => {
              const kids = childrenBy.get(parentId) ?? [];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              kids.forEach((st: any, idx: number) => {
                const path = [...prefix, idx + 1];
                m.set(st.id, path.join("."));
                walk(st.id, path);
              });
            };
            walk(null, []);
            return m;
          })();
          const stageMonthsFor = (stageId: string | null): number | null => {
            if (!stageId) return null;
            const s = stageByIdLocal.get(stageId);
            if (!s?.start_date || !s?.end_date) return null;
            const start = new Date(s.start_date).getTime();
            const end = new Date(s.end_date).getTime();
            if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
            return (end - start) / (1000 * 60 * 60 * 24) / 30.4375;
          };

          const billingMode: "resource" | "manual" | "role" =
            q.trip_billing_mode === "manual" || q.trip_billing_mode === "role"
              ? q.trip_billing_mode
              : "resource";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows = ((siteTripsRaw ?? []) as any[]).map((t) => {
            const ids: string[] = Array.isArray(t.resource_ids) ? t.resource_ids : [];
            const resourceHourlyRates =
              t.resource_hourly_rates && typeof t.resource_hourly_rates === "object"
                ? (t.resource_hourly_rates as Record<string, unknown>)
                : {};
            const manual = Number(t.resource_hourly_rate) || 0;
            const resourceSum = ids.reduce(
              (s, id) => {
                const override = Number(resourceHourlyRates[id]) || 0;
                return s + (override > 0 ? override : Number(resourceRateById.get(id)) || 0);
              },
              0,
            );
            const roleSum = ids.reduce((s, id) => {
              const code = resourceRoleCodeById.get(id) ?? "";
              return s + (saleByCode.get(code) ?? 0);
            }, 0);
            const hourlyRate =
              billingMode === "manual"
                ? manual
                : billingMode === "role"
                  ? roleSum > 0
                    ? roleSum
                    : manual // legacy fallback: quotes pre-dating billingMode kept manual €/h
                  : resourceSum > 0
                    ? resourceSum
                    : manual; // legacy fallback: same for default "resource" mode

            const km = Number(t.km) || 0;
            const ppk = Number(t.price_per_km) || 0;
            const hrs = Number(t.trip_hours) || 0;
            const perTripKmCost = km * ppk * 2;
            const perTripHrCost = hrs * hourlyRate * 2;
            const perTripTotal = perTripKmCost + perTripHrCost;
            const stageMonths = stageMonthsFor(t.stage_id ?? null);
            const override = t.duration_months_override;
            const effectiveMonths =
              override != null && Number.isFinite(Number(override)) && Number(override) > 0
                ? Number(override)
                : stageMonths;
            const freqVal = Number(t.frequency_value) || 0;
            const totalTrips =
              t.frequency_mode === "per_month"
                ? freqVal * (effectiveMonths ?? 0)
                : freqVal;
            const totalCost = perTripTotal * totalTrips;
            const stage = t.stage_id ? stageByIdLocal.get(t.stage_id) : null;
            const displayMode = t.display_mode === "name" ? "name" : "role";
            const resourceNames = ids
              .map((id) => {
                if (displayMode === "name") {
                  return (
                    resourceNameById.get(id) ?? resourceRoleById.get(id) ?? ""
                  );
                }
                // "role" (default): prefer role, fall back to name so nothing is blank.
                return resourceRoleById.get(id) ?? resourceNameById.get(id) ?? "";
              })
              .filter((n): n is string => !!n);
            return {
              id: String(t.id),
              label: String(t.label ?? ""),
              stageId: (t.stage_id ?? null) as string | null,
              stageName: stage?.name ?? null,
              stageNumber: t.stage_id ? stageNumberMap.get(t.stage_id) ?? null : null,
              km,
              pricePerKm: ppk,
              tripHours: hrs,
              hourlyRate,
              frequencyMode: (t.frequency_mode === "per_month" ? "per_month" : "total") as "per_month" | "total",
              frequencyValue: freqVal,
              stageMonths,
              durationMonthsOverride:
                override != null && Number.isFinite(Number(override)) ? Number(override) : null,
              totalTrips,
              perTripKmCost,
              perTripHrCost,
              perTripTotal,
              totalCost,
              resourceNames,
              notes: t.notes ?? null,
            };
          });
          const siteTripsTotal = rows.reduce((s, r) => s + (r.totalCost || 0), 0);
          return { siteTrips: rows, siteTripsTotal };
        })(),
        billableRates,
        missing,
        revision: { number: null, sentAt: null, isDraft: true },
      };
}

/**
 * React hook wrapper. When a historical revision is being viewed (see
 * `RevisionProvider`), this returns the frozen snapshot captured at send
 * time and performs no network access at all.
 */
export function useLiveQuoteSnapshot(
  quoteId: string | null | undefined,
  lang: ProposalLang = "pt-PT",
) {
  const frozen = useFrozenQuoteSnapshot(lang);
  const query = useQuery({
    enabled: !!quoteId && !frozen,
    queryKey: ["psa-live-quote", quoteId, lang],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: () => fetchLiveQuoteSnapshot(quoteId!, lang),
  });
  if (frozen) {
    return {
      ...query,
      data: frozen,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
    } as typeof query;
  }
  return query;
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
  totalSuppliers: string;
  totalOptional: string;

  feeTableIntro: string;

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
  objective: string;
  keyActivities: string;
  stageApproval: string;
  scopeIncludes: string;
  appendicesLabel: string;
  appendix: string;
  noAppendices: string;
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
  downpaymentReceived: string;
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
  phaseSummary: string;
  professionalFee: string;
  teamAllocation: string;
  reviewCyclesIncluded: string;
  reviewCycleSingular: string;
  reviewCyclePlural: string;
  coordinationMeetings: string;
  drawingIssue: string;
  clientApprovalRequired: string;
  cgiImagesIncluded: string;
  bimLod: string;
  yes: string;
  no: string;
  toBeDefined: string;
  included: string;
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
  totalSuppliers: "Total Fornecedores",
  totalOptional: "Total Opcionais",

  feeTableIntro:
    "A proposta de honorários abaixo reflecte o âmbito de trabalho descrito, organizado por fase de projecto. Os valores apresentados são líquidos de IVA.",

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
  objective: "Objetivo",
  keyActivities: "Actividades Principais",
  stageApproval: "Aprovação da Fase",
  scopeIncludes: "Âmbito Incluído",
  appendicesLabel: "ANEXOS",
  appendix: "Anexo",
  noAppendices: "Sem anexos configurados.",
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
  downpaymentReceived: "Adiantamento recebido",
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
  phaseSummary: "Resumo da Fase",
  professionalFee: "Honorários",
  teamAllocation: "Afectação de equipa",
  reviewCyclesIncluded: "Ciclos de revisão incluídos",
  reviewCycleSingular: "ciclo de revisão consolidado",
  reviewCyclePlural: "ciclos de revisão consolidados",
  coordinationMeetings: "Reuniões de coordenação incluídas",
  drawingIssue: "Pacote de entrega",
  clientApprovalRequired: "Aprovação do cliente necessária",
  cgiImagesIncluded: "Imagens 3D incluídas",
  bimLod: "BIM / LOD",
  yes: "Sim",
  no: "Não",
  toBeDefined: "A definir",
  included: "Incluído",
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
  totalSuppliers: "Total Suppliers",
  totalOptional: "Total Optional",

  feeTableIntro:
    "The fee proposal below reflects the described scope of work, organised by project stage. Values are exclusive of VAT.",

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
  objective: "Objective",
  keyActivities: "Key Activities",
  stageApproval: "Stage Approval",
  scopeIncludes: "Scope Includes",
  appendicesLabel: "APPENDICES",
  appendix: "Appendix",
  noAppendices: "No appendices configured.",
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
  downpaymentReceived: "Downpayment received",
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
  phaseSummary: "Phase Summary",
  professionalFee: "Professional Fee",
  teamAllocation: "Team Allocation",
  reviewCyclesIncluded: "Review Cycles Included",
  reviewCycleSingular: "consolidated review cycle",
  reviewCyclePlural: "consolidated review cycles",
  coordinationMeetings: "Coordination Meetings Included",
  drawingIssue: "Drawing Issue",
  clientApprovalRequired: "Client Approval Required",
  cgiImagesIncluded: "CGI Images Included",
  bimLod: "BIM / LOD",
  yes: "Yes",
  no: "No",
  toBeDefined: "To be defined",
  included: "Included",
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



