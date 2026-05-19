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

interface QuoteRow {
  id: string;
  titulo: string;
  quote_status: string;
  quote_type: string | null;
  quote_category: string | null;
  currency: string | null;
  total_fee: number | null;
  sold_fee: number | null;
  pricing_multiplier: number | null;
  is_public_tender: boolean | null;
  pm_project_id: string | null;
  company_id: string | null;
  opportunity_id: string | null;
  proposal_kind: string | null;
  ontology_family_code: string | null;
  ontology_preset_code: string | null;
  ontology_delivery_mode: string | null;
  ontology_flags: unknown;
  ontology_metadata: unknown;
  ontology_bootstrapped_at: string | null;
}

export async function buildContractSnapshot(
  quoteId: string,
): Promise<ContractSnapshotBundle> {
  const [quoteRes, stagesRes, paymentsRes, externalsRes] = await Promise.all([
    db
      .from("fee_proposals")
      .select(
        "id, titulo, quote_status, quote_type, quote_category, currency, total_fee, sold_fee, pricing_multiplier, is_public_tender, pm_project_id, company_id, opportunity_id, proposal_kind, ontology_family_code, ontology_preset_code, ontology_delivery_mode, ontology_flags, ontology_metadata, ontology_bootstrapped_at",
      )
      .eq("id", quoteId)
      .maybeSingle(),
    db
      .from("quote_stages")
      .select("id, name, fee_amount, sort_order, duration_days, ontology_phase_code")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
    db
      .from("quote_payment_schedule")
      .select("id, label, sequence, amount, due_date, notes")
      .eq("quote_id", quoteId)
      .order("sequence", { ascending: true }),
    db
      .from("quote_external_services")
      .select("id, name, purchase_price, sale_price, quantity")
      .eq("quote_id", quoteId),
  ]);

  if (quoteRes.error) throw new Error(quoteRes.error.message);
  const quote = quoteRes.data as QuoteRow | null;
  if (!quote) throw new Error(`Quote ${quoteId} not found`);

  const [companyRes, oppRes] = await Promise.all([
    quote.company_id
      ? db.from("companies").select("id, nome").eq("id", quote.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    quote.opportunity_id
      ? db
          .from("crm_opportunities")
          .select("id, name")
          .eq("id", quote.opportunity_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const proposal: ContractProposalSnapshot = {
    quote_id: quote.id,
    title: quote.titulo,
    quote_status: quote.quote_status,
    quote_type: quote.quote_type,
    quote_category: quote.quote_category,
    currency: quote.currency ?? "EUR",
    company: {
      id: (companyRes.data as { id?: string } | null)?.id ?? null,
      name: (companyRes.data as { nome?: string } | null)?.nome ?? null,
    },
    opportunity: {
      id: (oppRes.data as { id?: string } | null)?.id ?? null,
      name: (oppRes.data as { name?: string } | null)?.name ?? null,
    },
    pm_project_id: quote.pm_project_id,
    proposal_kind: quote.proposal_kind,
    is_public_tender: !!quote.is_public_tender,
  };

  const enabledPhases =
    (stagesRes.data ?? []).map(
      (s: {
        name: string;
        sort_order: number | null;
        duration_days: number | null;
        fee_amount: number | null;
        ontology_phase_code: string | null;
      }) => ({
        code: s.ontology_phase_code,
        name: s.name,
        order: s.sort_order ?? 0,
        duration_days: s.duration_days,
        fee_amount: s.fee_amount,
      }),
    );

  const ontology: ContractOntologySnapshot = {
    family_code: quote.ontology_family_code,
    preset_code: quote.ontology_preset_code,
    delivery_mode: quote.ontology_delivery_mode,
    flags: (quote.ontology_flags as Record<string, unknown>) ?? {},
    metadata: (quote.ontology_metadata as Record<string, unknown>) ?? {},
    enabled_phases: enabledPhases,
    bootstrapped_at: quote.ontology_bootstrapped_at,
  };

  const externalServices =
    (externalsRes.data ?? []).map(
      (e: { name: string; purchase_price: number | null; sale_price: number | null; quantity: number | null }) => ({
        name: e.name,
        purchase_price: e.purchase_price,
        sale_price: e.sale_price,
        quantity: e.quantity,
      }),
    );

  const paymentSchedule =
    (paymentsRes.data ?? []).map(
      (p: { label: string | null; sequence: number; amount: number; due_date: string | null; notes: string | null }) => ({
        label: p.label,
        sequence: p.sequence,
        amount: Number(p.amount) || 0,
        due_date: p.due_date,
        notes: p.notes,
      }),
    );

  const hasAtRetainer =
    ((quote.ontology_metadata as Record<string, unknown> | null)?.["addons"] as
      | string[]
      | undefined)?.includes("at_retainer") ?? false;

  const recurring =
    quote.quote_type === "retainer" ||
    quote.quote_type === "time_based_retainer" ||
    quote.proposal_kind === "retainer";

  const commercial: ContractCommercialSnapshot = {
    total_fee: Number(quote.sold_fee ?? quote.total_fee ?? 0) || 0,
    pricing_multiplier: quote.pricing_multiplier,
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
