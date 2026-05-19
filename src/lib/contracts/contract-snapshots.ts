/**
 * Stage 5A — Contract Generator Foundation
 *
 * buildContractSnapshot: gather every input needed to render a
 * deterministic contract draft into a single, sealed JSON bundle.
 *
 * Pure-ish: makes Supabase reads, but produces a value with no live
 * references back to the source rows. Once persisted into
 * contracts.{snapshot,ontology,commercial,proposal}_snapshot_json,
 * later proposal edits cannot mutate the contract.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  CONTRACT_RESOLVER_VERSION,
  type ContractSnapshotBundle,
  type ContractCommercialSnapshot,
  type ContractOntologySnapshot,
  type ContractProposalSnapshot,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function daysBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

export async function buildContractSnapshot(
  quoteId: string,
): Promise<ContractSnapshotBundle> {
  const [quoteRes, stagesRes, paymentsRes, externalsRes] = await Promise.all([
    db
      .from("fee_proposals")
      .select(
        "id, titulo, quote_status, quote_type, quote_category, valor, pricing_multiplier, pm_project_id, company_id, opportunity_id, ontology_family_code, ontology_preset_code, ontology_delivery_mode, ontology_flags, ontology_metadata, ontology_bootstrapped_at",
      )
      .eq("id", quoteId)
      .maybeSingle(),
    db
      .from("quote_stages")
      .select("id, name, budget, sort_order, start_date, end_date, phase_code")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
    db
      .from("quote_payment_schedule_items")
      .select("id, label, sort_order, amount_value, expected_invoice_date, notes")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
    db
      .from("quote_external_services")
      .select("id, description, purchase_price, sale_price, quantity")
      .eq("quote_id", quoteId),
  ]);

  if (quoteRes.error) throw new Error(quoteRes.error.message);
  const quote = quoteRes.data as Record<string, unknown> | null;
  if (!quote) throw new Error(`Quote ${quoteId} not found`);

  const companyId = quote.company_id as string | null;
  const opportunityId = quote.opportunity_id as string | null;

  const [companyRes, oppRes] = await Promise.all([
    companyId
      ? db.from("companies").select("id, nome").eq("id", companyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    opportunityId
      ? db.from("crm_opportunities").select("id, name").eq("id", opportunityId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const proposal: ContractProposalSnapshot = {
    quote_id: quote.id as string,
    title: (quote.titulo as string) ?? "(sem título)",
    quote_status: quote.quote_status as string,
    quote_type: (quote.quote_type as string | null) ?? null,
    quote_category: (quote.quote_category as string | null) ?? null,
    currency: "EUR",
    company: {
      id: (companyRes.data as { id?: string } | null)?.id ?? null,
      name: (companyRes.data as { nome?: string } | null)?.nome ?? null,
    },
    opportunity: {
      id: (oppRes.data as { id?: string } | null)?.id ?? null,
      name: (oppRes.data as { name?: string } | null)?.name ?? null,
    },
    pm_project_id: (quote.pm_project_id as string | null) ?? null,
    proposal_kind: null,
    is_public_tender: false,
  };

  type StageRow = {
    name: string;
    sort_order: number | null;
    budget: number | null;
    start_date: string | null;
    end_date: string | null;
    phase_code: string | null;
  };
  const enabledPhases = ((stagesRes.data ?? []) as StageRow[]).map((s) => ({
    code: s.phase_code,
    name: s.name,
    order: s.sort_order ?? 0,
    duration_days: daysBetween(s.start_date, s.end_date),
    fee_amount: s.budget != null ? Number(s.budget) : null,
  }));

  const ontology: ContractOntologySnapshot = {
    family_code: (quote.ontology_family_code as string | null) ?? null,
    preset_code: (quote.ontology_preset_code as string | null) ?? null,
    delivery_mode: (quote.ontology_delivery_mode as string | null) ?? null,
    flags: (quote.ontology_flags as Record<string, unknown>) ?? {},
    metadata: (quote.ontology_metadata as Record<string, unknown>) ?? {},
    enabled_phases: enabledPhases,
    bootstrapped_at: (quote.ontology_bootstrapped_at as string | null) ?? null,
  };

  type ExtRow = {
    description: string;
    purchase_price: number | null;
    sale_price: number | null;
    quantity: number | null;
  };
  const externalServices = ((externalsRes.data ?? []) as ExtRow[]).map((e) => ({
    name: e.description,
    purchase_price: e.purchase_price,
    sale_price: e.sale_price,
    quantity: e.quantity,
  }));

  type PayRow = {
    label: string | null;
    sort_order: number;
    amount_value: number;
    expected_invoice_date: string | null;
    notes: string | null;
  };
  const paymentSchedule = ((paymentsRes.data ?? []) as PayRow[]).map((p) => ({
    label: p.label,
    sequence: p.sort_order,
    amount: Number(p.amount_value) || 0,
    due_date: p.expected_invoice_date,
    notes: p.notes,
  }));

  const metadata = (quote.ontology_metadata as Record<string, unknown> | null) ?? {};
  const addons = Array.isArray(metadata["addons"]) ? (metadata["addons"] as string[]) : [];
  const hasAtRetainer = addons.includes("at_retainer");

  const quoteType = String(quote.quote_type ?? "");
  const recurring = quoteType.includes("retainer");

  const commercial: ContractCommercialSnapshot = {
    total_fee: Number(quote.valor ?? 0) || 0,
    pricing_multiplier: (quote.pricing_multiplier as number | null) ?? null,
    payment_schedule: paymentSchedule,
    external_services: externalServices,
    has_at_retainer: hasAtRetainer,
    recurring,
  };

  return {
    resolver_version: CONTRACT_RESOLVER_VERSION,
    generated_at: new Date().toISOString(),
    proposal,
    ontology,
    commercial,
  };
}
