/**
 * Point-in-time capture of everything a proposal renders from.
 *
 * Called when a proposal is SENT. Produces the `quote_data` payload stored
 * inside `psa_proposal_snapshots.snapshot`, so the revision can later be
 * re-rendered exactly as it was, independent of subsequent quote edits.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchLiveQuoteSnapshot, type ProposalLang } from "./live-data";
import {
  QUOTE_SNAPSHOT_SCHEMA_VERSION,
  type FrozenQuoteData,
} from "./revision-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const LANGS: ProposalLang[] = ["pt-PT", "en"];

async function rows(table: string, column: string, value: string) {
  const { data } = await sb.from(table).select("*").eq(column, value);
  return data ?? [];
}

/**
 * Capture the resolved (render-ready) payload in every supported language
 * plus the verbatim source rows for audit.
 */
export async function captureQuoteData(
  quoteId: string | null | undefined,
): Promise<FrozenQuoteData | null> {
  if (!quoteId) return null;

  const resolvedEntries = await Promise.all(
    LANGS.map(async (lang) => {
      try {
        return [lang, await fetchLiveQuoteSnapshot(quoteId, lang)] as const;
      } catch {
        return [lang, null] as const;
      }
    }),
  );
  const resolved: FrozenQuoteData["resolved"] = {};
  for (const [lang, snap] of resolvedEntries) {
    if (snap) resolved[lang] = snap;
  }

  // Verbatim source rows — audit only, never used for rendering.
  const [
    quote,
    stages,
    dependencies,
    allocations,
    externalServices,
    paymentSchedule,
    billableRates,
    siteTrips,
    supplierMarkups,
    supplierCosts,
  ] = await Promise.all([
    sb.from("fee_proposals").select("*").eq("id", quoteId).maybeSingle().then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.data ?? null,
    ),
    rows("quote_stages", "quote_id", quoteId),
    rows("quote_stage_dependencies", "quote_id", quoteId),
    rows("quote_allocations", "quote_id", quoteId),
    rows("quote_external_services", "quote_id", quoteId),
    rows("quote_payment_schedule_items", "quote_id", quoteId),
    rows("quote_billable_hourly_rates", "quote_id", quoteId),
    rows("quote_site_trips", "quote_id", quoteId),
    rows("quote_supplier_markups", "quote_id", quoteId),
    rows("quote_stage_supplier_costs", "quote_id", quoteId),
  ]);

  // Resource rates behind the allocations, so cost/sale numbers are traceable.
  const resourceIds = Array.from(
    new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (allocations as any[]).map((a) => a.resource_id).filter(Boolean),
    ),
  );
  let resources: unknown[] = [];
  let resourceRates: unknown[] = [];
  if (resourceIds.length) {
    const [{ data: res }, { data: rates }] = await Promise.all([
      sb.from("pm_resources").select("*").in("id", resourceIds),
      sb.from("pm_resource_rates").select("*").in("resource_id", resourceIds),
    ]);
    resources = res ?? [];
    resourceRates = rates ?? [];
  }

  const { data: proposalRoles } = await sb.from("proposal_roles").select("*");

  return {
    schema_version: QUOTE_SNAPSHOT_SCHEMA_VERSION,
    captured_at: new Date().toISOString(),
    resolved,
    raw: {
      quote,
      quote_stages: stages,
      quote_stage_dependencies: dependencies,
      quote_allocations: allocations,
      quote_external_services: externalServices,
      quote_payment_schedule_items: paymentSchedule,
      quote_billable_hourly_rates: billableRates,
      quote_site_trips: siteTrips,
      quote_supplier_markups: supplierMarkups,
      quote_stage_supplier_costs: supplierCosts,
      pm_resources: resources,
      pm_resource_rates: resourceRates,
      proposal_roles: proposalRoles ?? [],
    },
  };
}
