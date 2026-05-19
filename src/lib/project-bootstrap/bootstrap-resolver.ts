/**
 * Stage 6A — Deterministic preview resolver.
 *
 * Input: sealed ProjectBootstrapSnapshot.
 * Output: ProjectBootstrapPreview (project shell + stages + dependencies).
 *
 * Pure function — no I/O. Same input → same output, modulo applied_at being
 * stamped later by the apply service.
 */
import type {
  PreviewDependency,
  PreviewStage,
  ProjectBootstrapPreview,
  ProjectBootstrapSnapshot,
} from "./types";

export function resolveProjectBootstrapPreview(
  snap: ProjectBootstrapSnapshot,
): ProjectBootstrapPreview {
  const warnings: string[] = [];
  const skipped: string[] = [];
  const unsupported: string[] = [];

  const contract = snap.contract;
  const proposal = snap.contract_snapshot.proposal;
  const ontology = snap.contract_snapshot.ontology;
  const commercial = snap.contract_snapshot.commercial;

  // Stages from sealed ontology phases.
  const stages: PreviewStage[] = (ontology.enabled_phases ?? []).map((p, idx) => {
    const key = p.code ?? `phase-${idx + 1}`;
    return {
      key,
      name: p.name,
      start_date: null,
      end_date: null,
      budget: typeof p.fee_amount === "number" ? p.fee_amount : 0,
      sort_order: p.order ?? idx,
    };
  });

  if (!stages.length) {
    warnings.push("contract_has_no_phases");
  }

  // Dependencies — not yet sealed in v1 contract snapshot; skip.
  const dependencies: PreviewDependency[] = [];
  if (!dependencies.length) {
    skipped.push("dependencies_not_in_snapshot_v1");
  }

  // Things explicitly deferred to later stages.
  unsupported.push("allocations");
  unsupported.push("invoices");
  unsupported.push("payment_schedule_seed");

  const totalFee = commercial.total_fee ?? 0;
  const externalsTotal = (commercial.external_services ?? []).reduce(
    (acc, e) =>
      acc + (typeof e.sale_price === "number" ? e.sale_price : 0) * (e.quantity ?? 1),
    0,
  );
  const internalFee = Math.max(0, totalFee - externalsTotal);

  return {
    project: {
      name: proposal.title || contract.title,
      company_id: proposal.company?.id ?? snap.source_company_id ?? null,
      opportunity_id: proposal.opportunity?.id ?? snap.source_opportunity_id ?? null,
      quote_id: proposal.quote_id ?? snap.source_quote_id ?? null,
      sold_fee: totalFee,
      sold_internal_fee: internalFee,
      sold_external_fee: externalsTotal,
      sold_pricing_multiplier: commercial.pricing_multiplier ?? null,
      sold_at: contract.signed_at,
      currency: proposal.currency ?? contract.currency,
    },
    stages,
    dependencies,
    warnings,
    skipped,
    unsupported,
  };
}
