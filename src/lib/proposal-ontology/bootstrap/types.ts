/**
 * PSA Proposal Ontology — Milestone 2
 * Bootstrap planning types.
 *
 * A BootstrapPlan is the PURE output of `computeBootstrapPlan`. It describes
 * what the system would set up for a quote based on the selected preset and
 * calculator inputs. It is intentionally side-effect free and serializable.
 *
 * `applyBootstrapPlan` (see ./apply.ts) is the only place that touches the DB,
 * and it respects `manual_override` on every existing row.
 */
import type {
  ProposalPhase,
  ProposalPreset,
  ProposalFamily,
  ProposalDeliveryMode,
  DeliveryModeCode,
} from "../types";
import type { QuoteDepType, QuotePaymentTrigger, QuotePaymentAmountType } from "@/lib/quotes/types";

export const BOOTSTRAP_GENERATOR_SOURCE = "ontology_bootstrap" as const;

export interface BootstrapInput {
  /** The preset that defines which phases are enabled and the default topology. */
  preset: ProposalPreset;
  /** Canonical phases (full registry — used to resolve metadata for enabled phases). */
  phases: ProposalPhase[];
  /** Family — purely informational (defaults already baked into preset). */
  family?: ProposalFamily | null;
  /** Delivery mode — informational; influences fee scaling / wording metadata. */
  deliveryMode?: ProposalDeliveryMode | null;
  /** Project start date (ISO yyyy-mm-dd). */
  projectStart: string;
  /**
   * Per-phase duration in working/calendar days, keyed by phase code.
   * Anything missing falls back to `defaultDurationDays`.
   */
  durationsByPhase?: Record<string, number>;
  /** Fallback duration when a phase has no explicit duration. */
  defaultDurationDays?: number;
  /** Per-phase budget split (absolute). Optional — used to seed stage.budget. */
  budgetsByPhase?: Record<string, number>;
  /** Flags resolved for this proposal (e.g. { bim_enabled: true }). */
  flags?: Record<string, unknown>;
}

export interface BootstrapStagePlan {
  /** Canonical phase code (e.g. 'P1'). null when this stage represents an add-on only. */
  phase_code: string | null;
  /** Add-on module code when the stage represents a parallel add-on. */
  addon_module_code: string | null;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
  budget: number;
  color: string;
  /** Marker for downstream apply step. */
  is_generated: true;
  generator_source: typeof BOOTSTRAP_GENERATOR_SOURCE;
  /** Carried through to the apply step for routing decisions. */
  phase_class: "finite_milestone" | "operational_recurring" | "parallel_addon";
}

export interface BootstrapDependencyPlan {
  predecessor_phase_code: string;
  successor_phase_code: string;
  type: QuoteDepType;
  lag_days: number;
  is_generated: true;
  generator_source: typeof BOOTSTRAP_GENERATOR_SOURCE;
}

export interface BootstrapPaymentPlan {
  /** Canonical phase code this payment is tied to (when applicable). */
  phase_code: string | null;
  label: string;
  trigger_type: QuotePaymentTrigger;
  amount_type: QuotePaymentAmountType;
  amount_value: number;
  sort_order: number;
  generator_source: typeof BOOTSTRAP_GENERATOR_SOURCE;
}

export interface BootstrapPlan {
  preset_code: string;
  family_code: string | null;
  delivery_mode: DeliveryModeCode | null;
  flags: Record<string, unknown>;
  stages: BootstrapStagePlan[];
  dependencies: BootstrapDependencyPlan[];
  payment_items: BootstrapPaymentPlan[];
  /** Free-form metadata stored on fee_proposals.ontology_metadata. */
  metadata: Record<string, unknown>;
}
