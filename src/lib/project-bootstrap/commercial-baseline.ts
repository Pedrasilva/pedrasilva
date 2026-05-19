/**
 * Stage 6B — Commercial baseline & allocation placeholder resolvers.
 *
 * Pure functions. Consume ONLY the sealed ProjectBootstrapSnapshot
 * (signed contract snapshot + ontology metadata). Never read live quote
 * or proposal data.
 *
 * Outputs are deterministic envelopes — they describe what the project is
 * EXPECTED to deliver. No collaborators, no real allocations, no
 * timesheets, no invoices.
 */
import type { ProjectBootstrapSnapshot } from "./types";
import type {
  ProjectCommercialBaselineInput,
  StageCommercialBaselineInput,
  StageAllocationPlaceholderInput,
  PhaseClass,
  DeliveryMode,
} from "./baseline-types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function phaseClassFor(
  phase: { code: string | null; name: string },
  ontologyFlags: Record<string, unknown>,
  recurring: boolean,
): PhaseClass {
  const code = (phase.code ?? "").toLowerCase();
  const name = phase.name.toLowerCase();
  if (
    code.includes("at-") ||
    code === "at" ||
    name.includes("acompanhamento técnico") ||
    name.includes("at ") ||
    name.startsWith("at")
  ) {
    return "operational_recurring";
  }
  if (recurring) return "operational_recurring";
  if (
    code.includes("procurement") ||
    code.includes("supply") ||
    name.includes("procurement") ||
    name.includes("aquisição")
  ) {
    return "support_only";
  }
  if (Boolean(ontologyFlags.parallel_addon)) return "parallel_addon";
  return "finite";
}

function inferDeliveryMode(snap: ProjectBootstrapSnapshot): DeliveryMode {
  const m = snap.contract_snapshot.ontology.delivery_mode;
  if (m === "internal" || m === "external" || m === "mixed") return m;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Project-level baseline                                                     */
/* -------------------------------------------------------------------------- */

export function resolveProjectCommercialBaseline(
  snap: ProjectBootstrapSnapshot,
): ProjectCommercialBaselineInput {
  const commercial = snap.contract_snapshot.commercial;
  const ontology = snap.contract_snapshot.ontology;

  const totalFee = num(commercial.total_fee) ?? 0;
  const externals = commercial.external_services ?? [];
  const externalTotal = externals.reduce((acc, e) => {
    const sale = num(e.sale_price) ?? 0;
    const qty = num(e.quantity) ?? 1;
    return acc + sale * qty;
  }, 0);
  const internalFee = Math.max(0, totalFee - externalTotal);

  // Heuristic split: treat all externals as "consultant" by default until we
  // have a richer taxonomy. Reimbursables remain null (no signal in v1).
  const consultantFee = externalTotal;
  const reimbursableAllowance: number | null = null;

  // Planned duration — sum of phase duration_days / 7 (weeks).
  const totalDays = (ontology.enabled_phases ?? []).reduce(
    (acc, p) => acc + (num(p.duration_days) ?? 0),
    0,
  );
  const plannedWeeks = totalDays > 0 ? +(totalDays / 7).toFixed(2) : null;

  // Construction months — only meaningful when AT/operational phases exist.
  const opPhases = (ontology.enabled_phases ?? []).filter((p) =>
    phaseClassFor(p, ontology.flags ?? {}, commercial.recurring) ===
    "operational_recurring",
  );
  const opDays = opPhases.reduce((acc, p) => acc + (num(p.duration_days) ?? 0), 0);
  const plannedConstructionMonths = opDays > 0 ? +(opDays / 30).toFixed(2) : null;

  // Ontology family-default targets (conservative; null when unknown).
  const family = ontology.family_code ?? null;
  const defaults = familyTargetDefaults(family);

  return {
    sold_fee_total: totalFee,
    sold_internal_fee: internalFee,
    sold_external_fee: externalTotal,
    sold_consultant_fee: consultantFee,
    sold_reimbursable_allowance: reimbursableAllowance,
    target_chargeability_pct: defaults.chargeability,
    target_recoverability_pct: defaults.recoverability,
    target_gross_margin_pct: defaults.margin,
    planned_duration_weeks: plannedWeeks,
    planned_construction_months: plannedConstructionMonths,
    baseline_json: {
      resolver: "commercial-baseline.v1",
      family_code: family,
      preset_code: ontology.preset_code ?? null,
      delivery_mode: inferDeliveryMode(snap),
      has_at_retainer: Boolean(commercial.has_at_retainer),
      recurring: Boolean(commercial.recurring),
      externals_count: externals.length,
      total_phase_days: totalDays,
    },
  };
}

function familyTargetDefaults(family: string | null): {
  chargeability: number | null;
  recoverability: number | null;
  margin: number | null;
} {
  // Conservative architecture-firm defaults. Unknown families return null.
  switch ((family ?? "").toLowerCase()) {
    case "architecture":
    case "edificios":
    case "buildings":
      return { chargeability: 75, recoverability: 90, margin: 35 };
    case "urbanism":
    case "planeamento":
      return { chargeability: 70, recoverability: 85, margin: 30 };
    case "interior":
    case "interiors":
      return { chargeability: 78, recoverability: 92, margin: 38 };
    default:
      return { chargeability: null, recoverability: null, margin: null };
  }
}

/* -------------------------------------------------------------------------- */
/* Stage-level baselines                                                      */
/* -------------------------------------------------------------------------- */

export function resolveStageCommercialBaselines(
  snap: ProjectBootstrapSnapshot,
): StageCommercialBaselineInput[] {
  const ontology = snap.contract_snapshot.ontology;
  const commercial = snap.contract_snapshot.commercial;
  const phases = ontology.enabled_phases ?? [];
  const flags = ontology.flags ?? {};
  const deliveryMode = inferDeliveryMode(snap);

  // External cost ratio used to split estimated cost per stage.
  const totalFee = num(commercial.total_fee) ?? 0;
  const externalTotal = (commercial.external_services ?? []).reduce(
    (acc, e) => acc + (num(e.sale_price) ?? 0) * (num(e.quantity) ?? 1),
    0,
  );
  const externalRatio = totalFee > 0 ? externalTotal / totalFee : 0;

  // Hours envelope heuristic: 70 EUR effective sale rate when nothing better.
  const RATE_GUESS = 70;

  return phases.map((p, idx) => {
    const key = p.code ?? `phase-${idx + 1}`;
    const phaseClass = phaseClassFor(p, flags, commercial.recurring);
    const fee = num(p.fee_amount) ?? 0;

    let estHours: number | null = fee > 0 ? Math.round(fee / RATE_GUESS) : null;

    // support_only phases shouldn't over-seed hours (procurement coordination).
    if (phaseClass === "support_only" && estHours !== null) {
      estHours = Math.max(4, Math.round(estHours * 0.25));
    }
    // operational_recurring: fee is per duration; hours follow duration directly.
    if (phaseClass === "operational_recurring") {
      const days = num(p.duration_days) ?? 0;
      const months = days > 0 ? days / 30 : 0;
      estHours = months > 0 ? Math.round(months * 8) : estHours; // 8h/month default
    }

    const estExternalCost = +(fee * externalRatio).toFixed(2);
    const estInternalCost = Math.max(0, +(fee - estExternalCost).toFixed(2));

    return {
      project_stage_id: "__pending__", // filled by apply step
      source_contract_phase_key: key,
      sold_fee: fee,
      estimated_hours: estHours,
      estimated_internal_cost: estInternalCost,
      estimated_external_cost: estExternalCost,
      target_margin_pct: familyTargetDefaults(ontology.family_code).margin,
      target_recoverability_pct:
        familyTargetDefaults(ontology.family_code).recoverability,
      delivery_mode: deliveryMode,
      phase_class: phaseClass,
      baseline_json: {
        resolver: "commercial-baseline.v1",
        phase_order: p.order ?? idx,
        phase_duration_days: num(p.duration_days),
      },
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Allocation placeholders                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Generate placeholder workload envelopes per stage.
 * NOT real allocations — no collaborator_id.
 *
 * Source hierarchy:
 *  1. (future) sealed quote staffing data if present in snapshot
 *  2. ontology defaults by family/preset
 *  3. preset heuristics fallback
 */
export function resolveAllocationPlaceholders(
  snap: ProjectBootstrapSnapshot,
): StageAllocationPlaceholderInput[] {
  const ontology = snap.contract_snapshot.ontology;
  const commercial = snap.contract_snapshot.commercial;
  const phases = ontology.enabled_phases ?? [];
  const flags = ontology.flags ?? {};
  const family = (ontology.family_code ?? "").toLowerCase();

  const out: StageAllocationPlaceholderInput[] = [];
  const RATE_GUESS = 70;

  for (const [idx, p] of phases.entries()) {
    const key = p.code ?? `phase-${idx + 1}`;
    const phaseClass = phaseClassFor(p, flags, commercial.recurring);
    const fee = num(p.fee_amount) ?? 0;
    const days = num(p.duration_days) ?? 0;
    const durationWeeks = days > 0 ? +(days / 7).toFixed(2) : null;

    if (phaseClass === "operational_recurring") {
      const months = days > 0 ? days / 30 : 0;
      out.push({
        project_stage_id: "__pending__",
        source_contract_phase_key: key,
        discipline: "Architecture",
        role: "AT Oversight",
        expected_hours: months > 0 ? Math.round(months * 16) : 16,
        expected_fte: 0.1,
        expected_duration_weeks: durationWeeks,
        source: "ontology_default",
        confidence_pct: 60,
      });
      continue;
    }

    if (phaseClass === "support_only") {
      out.push({
        project_stage_id: "__pending__",
        source_contract_phase_key: key,
        discipline: "Coordination",
        role: "Procurement Coord.",
        expected_hours: Math.max(8, Math.round(fee / RATE_GUESS * 0.2)),
        expected_fte: null,
        expected_duration_weeks: durationWeeks,
        source: "ontology_default",
        confidence_pct: 50,
      });
      continue;
    }

    // finite + parallel_addon → default architecture team envelope.
    const totalHours = fee > 0 ? Math.round(fee / RATE_GUESS) : null;
    if (totalHours === null) continue;
    const leadShare = family.includes("interior") ? 0.45 : 0.55;
    const bimShare = 0.25;
    const supportShare = Math.max(0, 1 - leadShare - bimShare);

    out.push({
      project_stage_id: "__pending__",
      source_contract_phase_key: key,
      discipline: "Architecture",
      role: "Lead Architect",
      expected_hours: Math.round(totalHours * leadShare),
      expected_fte: null,
      expected_duration_weeks: durationWeeks,
      source: "ontology_default",
      confidence_pct: 65,
    });
    out.push({
      project_stage_id: "__pending__",
      source_contract_phase_key: key,
      discipline: "BIM",
      role: "BIM Coordinator",
      expected_hours: Math.round(totalHours * bimShare),
      expected_fte: null,
      expected_duration_weeks: durationWeeks,
      source: "ontology_default",
      confidence_pct: 60,
    });
    if (supportShare > 0) {
      out.push({
        project_stage_id: "__pending__",
        source_contract_phase_key: key,
        discipline: "Architecture",
        role: "Architect",
        expected_hours: Math.round(totalHours * supportShare),
        expected_fte: null,
        expected_duration_weeks: durationWeeks,
        source: "ontology_default",
        confidence_pct: 55,
      });
    }
  }

  return out;
}
