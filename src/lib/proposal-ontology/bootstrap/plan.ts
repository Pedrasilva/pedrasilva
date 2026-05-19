/**
 * PSA Proposal Ontology — Milestone 2
 * Pure orchestration logic. NO React. NO DB. NO supabase imports.
 *
 * Given a preset + canonical phase registry + calculator inputs, this
 * function produces a fully-described BootstrapPlan that the apply step
 * can write to the existing PSA Hub tables.
 *
 * Defaults — never rigid constraints:
 *   - finite_milestone phases chain sequentially via FS edges
 *   - operational_recurring phases (e.g. AT / P7) FS-follow the last finite phase
 *   - parallel_addon phases have NO predecessor edges (parallel by default)
 *   - payment defaults by phase class:
 *       finite_milestone        → 50% stage_start + 50% stage_end
 *       operational_recurring   → 1 monthly trigger placeholder per phase
 *       parallel_addon          → 1 lump at stage_start
 */
import type {
  BootstrapInput,
  BootstrapPlan,
  BootstrapStagePlan,
  BootstrapDependencyPlan,
  BootstrapPaymentPlan,
} from "./types";
import { BOOTSTRAP_GENERATOR_SOURCE } from "./types";
import type { ProposalPhase, DeliveryModeCode } from "../types";

const DEFAULT_DURATION_DAYS = 30;

const COLOR_BY_CLASS: Record<string, string> = {
  finite_milestone: "#22c55e",
  operational_recurring: "#f59e0b",
  parallel_addon: "#8b5cf6",
};

export function computeBootstrapPlan(input: BootstrapInput): BootstrapPlan {
  const { preset, phases, projectStart } = input;
  const defaultDur = input.defaultDurationDays ?? DEFAULT_DURATION_DAYS;

  // ---------- 1. Resolve enabled phases from the preset ----------
  const enabled = (preset.enabled_phases ?? []).filter(Boolean);
  const phaseByCode = new Map(phases.map((p) => [p.code, p]));
  const enabledPhases: ProposalPhase[] = enabled
    .map((code) => phaseByCode.get(code))
    .filter((p): p is ProposalPhase => !!p)
    .sort((a, b) => Number(a.default_order) - Number(b.default_order));

  // ---------- 2. Generate stages with sequential dates per phase class ----------
  const stages: BootstrapStagePlan[] = [];
  let cursor = projectStart; // running date pointer for finite phases

  enabledPhases.forEach((phase, idx) => {
    const cls = (phase.phase_class as BootstrapStagePlan["phase_class"]) ?? "finite_milestone";
    const dur =
      input.durationsByPhase?.[phase.code] ??
      (cls === "operational_recurring" ? Math.max(defaultDur * 3, 90) : defaultDur);

    let startISO: string;
    let endISO: string;

    if (cls === "parallel_addon") {
      // Parallel add-on: spans the whole project window so far (or a fixed slice).
      startISO = projectStart;
      endISO = addDaysISO(projectStart, dur);
    } else if (cls === "operational_recurring") {
      // Recurring (AT) typically starts where the previous finite phase ends.
      startISO = cursor;
      endISO = addDaysISO(startISO, dur);
      // Recurring does not advance the cursor for sequencing siblings.
    } else {
      // finite_milestone: sequential
      startISO = cursor;
      endISO = addDaysISO(startISO, dur);
      cursor = endISO;
    }

    stages.push({
      phase_code: phase.code,
      addon_module_code: null,
      name: phase.label_en, // localized at render time; storing canonical EN for stability
      start_date: startISO,
      end_date: endISO,
      sort_order: idx,
      budget: input.budgetsByPhase?.[phase.code] ?? 0,
      color: COLOR_BY_CLASS[cls] ?? "#22c55e",
      is_generated: true,
      generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      phase_class: cls,
    });
  });

  // ---------- 3. Add-on modules → parallel stage plans ----------
  (preset.default_addons ?? []).forEach((addonCode, i) => {
    stages.push({
      phase_code: null,
      addon_module_code: addonCode,
      name: humanizeCode(addonCode),
      start_date: projectStart,
      end_date: addDaysISO(projectStart, Math.max(defaultDur * 2, 60)),
      sort_order: enabledPhases.length + i,
      budget: 0,
      color: COLOR_BY_CLASS.parallel_addon,
      is_generated: true,
      generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      phase_class: "parallel_addon",
    });
  });

  // ---------- 4. Default dependency topology ----------
  const dependencies: BootstrapDependencyPlan[] = [];
  const finiteChain = enabledPhases.filter(
    (p) => (p.phase_class as string) === "finite_milestone",
  );
  for (let i = 1; i < finiteChain.length; i++) {
    dependencies.push({
      predecessor_phase_code: finiteChain[i - 1].code,
      successor_phase_code: finiteChain[i].code,
      type: "FS",
      lag_days: 0,
      is_generated: true,
      generator_source: BOOTSTRAP_GENERATOR_SOURCE,
    });
  }
  // Operational recurring follows the LAST finite phase (FS).
  const lastFinite = finiteChain[finiteChain.length - 1];
  if (lastFinite) {
    enabledPhases
      .filter((p) => (p.phase_class as string) === "operational_recurring")
      .forEach((p) => {
        dependencies.push({
          predecessor_phase_code: lastFinite.code,
          successor_phase_code: p.code,
          type: "FS",
          lag_days: 0,
          is_generated: true,
          generator_source: BOOTSTRAP_GENERATOR_SOURCE,
        });
      });
  }
  // parallel_addon: no default dependencies (parallel).

  // ---------- 5. Default payment items by phase class ----------
  const payment_items: BootstrapPaymentPlan[] = [];
  let payOrder = 0;
  stages.forEach((s) => {
    if (s.phase_class === "finite_milestone") {
      payment_items.push({
        phase_code: s.phase_code,
        label: `Start of ${s.name}`,
        trigger_type: "stage_start",
        amount_type: "percent",
        amount_value: 50,
        sort_order: payOrder++,
        generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      });
      payment_items.push({
        phase_code: s.phase_code,
        label: `End of ${s.name}`,
        trigger_type: "stage_end",
        amount_type: "percent",
        amount_value: 50,
        sort_order: payOrder++,
        generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      });
    } else if (s.phase_class === "operational_recurring") {
      payment_items.push({
        phase_code: s.phase_code,
        label: `${s.name} — monthly`,
        trigger_type: "monthly",
        amount_type: "fixed",
        amount_value: 0,
        sort_order: payOrder++,
        generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      });
    } else {
      payment_items.push({
        phase_code: s.phase_code,
        label: s.name,
        trigger_type: "stage_start",
        amount_type: "fixed",
        amount_value: 0,
        sort_order: payOrder++,
        generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      });
    }
  });

  // ---------- 6. Resolve delivery mode + flags metadata ----------
  const deliveryCode = (preset.default_delivery_mode ?? null) as DeliveryModeCode | null;
  const mergedFlags = {
    ...(preset.default_flags as Record<string, unknown> | null ?? {}),
    ...(input.flags ?? {}),
  };

  return {
    preset_code: preset.code,
    family_code: preset.family_code,
    delivery_mode: deliveryCode,
    flags: mergedFlags,
    stages,
    dependencies,
    payment_items,
    metadata: {
      preset_code: preset.code,
      planning_topology: preset.planning_topology ?? {},
      procurement_behavior: preset.procurement_behavior ?? {},
      bim_defaults: preset.bim_defaults ?? {},
      at_defaults: preset.at_defaults ?? {},
      delivery_mode_hint: input.deliveryMode?.fee_scaling_hint ?? null,
    },
  };
}

// ---------- helpers ----------

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

function humanizeCode(code: string): string {
  return code
    .split("_")
    .map((s) => (s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1)))
    .join(" ");
}
