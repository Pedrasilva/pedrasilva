/**
 * Stage 5A — Contract Generator Foundation
 *
 * Deterministic resolvers: snapshot → clauses + exhibits.
 * Pure functions, reproducible across runs of the same resolver version.
 */
import { buildClausesFromSnapshot } from "./contract-clauses";
import type {
  ContractSnapshotBundle,
  ResolvedClause,
  ResolvedExhibit,
} from "./types";

export function resolveContractClauses(snap: ContractSnapshotBundle): ResolvedClause[] {
  return buildClausesFromSnapshot(snap);
}

export function resolveContractExhibits(snap: ContractSnapshotBundle): ResolvedExhibit[] {
  const exhibits: ResolvedExhibit[] = [];

  exhibits.push({
    exhibit_key: "scope",
    title: "Anexo · Âmbito",
    sort_order: 10,
    source_type: "ontology",
    source_id: null,
    content_json: {
      family_code: snap.ontology.family_code,
      preset_code: snap.ontology.preset_code,
      delivery_mode: snap.ontology.delivery_mode,
      flags: snap.ontology.flags,
    },
  });

  if (snap.ontology.enabled_phases.length) {
    exhibits.push({
      exhibit_key: "phases",
      title: "Anexo · Fases",
      sort_order: 20,
      source_type: "quote_stages",
      source_id: null,
      content_json: { phases: snap.ontology.enabled_phases },
    });
  }

  exhibits.push({
    exhibit_key: "fees",
    title: "Anexo · Honorários",
    sort_order: 30,
    source_type: "fee_proposal",
    source_id: snap.proposal.quote_id,
    content_json: {
      total_fee: snap.commercial.total_fee,
      currency: snap.proposal.currency,
      pricing_multiplier: snap.commercial.pricing_multiplier,
    },
  });

  if (snap.commercial.payment_schedule.length) {
    exhibits.push({
      exhibit_key: "payment_schedule",
      title: "Anexo · Calendário de pagamentos",
      sort_order: 40,
      source_type: "quote_payment_schedule_items",
      source_id: null,
      content_json: {
        recurring: snap.commercial.recurring,
        items: snap.commercial.payment_schedule,
      },
    });
  }

  if (snap.commercial.external_services.length) {
    exhibits.push({
      exhibit_key: "externals",
      title: "Anexo · Serviços externos",
      sort_order: 50,
      source_type: "quote_external_services",
      source_id: null,
      content_json: { items: snap.commercial.external_services },
    });
  }

  return exhibits;
}
