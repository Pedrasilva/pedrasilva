/**
 * V1 placeholder catalog. Each entry documents the placeholder string and
 * a short description used for UI tooltips and the unresolved warnings.
 */
export const PLACEHOLDER_CATALOG = [
  { key: "project_name", desc: "Project name" },
  { key: "project_code", desc: "Project / quote code" },
  { key: "client_name", desc: "Client display name" },
  { key: "proposal_date", desc: "Proposal date (ISO)" },
  { key: "proposal_version", desc: "Proposal version label" },
  { key: "currency", desc: "Currency code (EUR…)" },
  { key: "language", desc: "Proposal language code" },
  { key: "overall_project_duration", desc: "Sum of stage durations (days)" },
  { key: "construction_duration", desc: "Construction-assistance duration (months)" },
  { key: "construction_monthly_fee", desc: "Construction-assistance monthly fee" },
  { key: "construction_monthly_hours", desc: "Construction-assistance monthly hours" },
  { key: "project_stage_fee_table", desc: "Inline fee table for project stages" },
  { key: "construction_stage_fee_table", desc: "Inline retainer table for construction stage" },
  { key: "payment_schedule_table", desc: "Inline payment schedule" },
  { key: "proposal_gantt", desc: "Reference to programme/gantt appendix" },
  { key: "exclusions_list", desc: "Bulleted list of exclusions" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_CATALOG)[number]["key"];

/** Also dynamic: phase_duration_P1, phase_fee_P1, phase_hours_P1 for any stage code. */
export const DYNAMIC_PHASE_PLACEHOLDER_PREFIXES = [
  "phase_duration_",
  "phase_fee_",
  "phase_hours_",
] as const;
