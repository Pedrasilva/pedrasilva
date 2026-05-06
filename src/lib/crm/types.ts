import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];

// ============================================================
// Legacy proposal pipeline (kept until UI migrates fully)
// ============================================================
export type ProposalStatus = "lead" | "proposta_enviada" | "negociacao" | "ganho" | "perdido";
export type CrmActivityType = "chamada" | "email" | "reuniao" | "nota" | "outro";

export type FeeProposal = {
  id: string;
  titulo: string;
  company_id: string | null;
  contact_id: string | null;
  valor: number;
  probabilidade: number;
  pipeline_status: ProposalStatus;
  data_proposta: string | null;
  data_decisao: string | null;
  pm_project_id: string | null;
  notas: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // New (Quote) fields
  opportunity_id: string | null;
  account_id: string | null;
  fee_structure_type: FeeStructureType;
  quote_status: QuoteStatus;
  /** Commercial classification chosen at creation time. See QuoteType. */
  quote_type: QuoteType;
  /** Top-level workflow category. Drives which tabs/blocks/presets apply. */
  quote_category: QuoteCategory;
};

export type CrmActivity = {
  id: string;
  tipo: CrmActivityType;
  resumo: string;
  detalhes: string | null;
  data_actividade: string;
  company_id: string | null;
  contact_id: string | null;
  proposal_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PIPELINE_STATUSES: { value: ProposalStatus; label: string; color: string }[] = [
  { value: "lead", label: "Lead", color: "bg-slate-500" },
  { value: "proposta_enviada", label: "Proposta enviada", color: "bg-blue-500" },
  { value: "negociacao", label: "Negociação", color: "bg-amber-500" },
  { value: "ganho", label: "Ganho", color: "bg-emerald-500" },
  { value: "perdido", label: "Perdido", color: "bg-rose-500" },
];

export const ACTIVITY_TYPES: { value: CrmActivityType; label: string }[] = [
  { value: "chamada", label: "Chamada" },
  { value: "email", label: "Email" },
  { value: "reuniao", label: "Reunião" },
  { value: "nota", label: "Nota" },
  { value: "outro", label: "Outro" },
];

// ============================================================
// New commercial layer (Opportunity → Quote → Project)
// ============================================================

export type OpportunityStage = "lead" | "proposal" | "negotiation" | "won" | "lost";
export type QuoteStatus = "draft" | "sent" | "approved" | "rejected";
export type FeeStructureType = "fixed" | "staged" | "monthly";

/**
 * Commercial classification of a quote, set at creation time. Drives:
 * - which planning UI surfaces (stages/Gantt vs time-based settings)
 * - which proposal block-set the generator picks by default
 * - downstream conversion-to-project behaviour
 *
 * `standard_project` matches the legacy / pre-existing flow and is the
 * default for any quote created before this column existed.
 */
export type QuoteType =
  | "standard_project"
  | "construction_retainer"
  | "consultancy_hours_package";

/**
 * Top-level workflow category chosen at quote creation. Each category pins to
 * exactly one `quote_type` sub-value, enforced by a DB trigger:
 *   - "project"     → standard_project   (full project workflow w/ Gantt)
 *   - "time_based"  → consultancy_hours_package (hours-block consultancy)
 *   - "retainer"    → construction_retainer    (monthly construction retainer)
 *
 * The legacy "consultancy" value is accepted for back-compat reads but UI
 * code should treat it as equivalent to "time_based".
 */
export type QuoteCategory = "project" | "time_based" | "retainer" | "consultancy";

export const QUOTE_CATEGORIES: { value: QuoteCategory }[] = [
  { value: "project" },
  { value: "time_based" },
  { value: "retainer" },
];

export const QUOTE_TYPES: { value: QuoteType }[] = [
  { value: "standard_project" },
  { value: "construction_retainer" },
  { value: "consultancy_hours_package" },
];

/** Quote sub-types valid for each top-level category. */
export const QUOTE_TYPES_BY_CATEGORY: Record<QuoteCategory, QuoteType[]> = {
  project: ["standard_project"],
  time_based: ["consultancy_hours_package"],
  retainer: ["construction_retainer"],
  consultancy: ["consultancy_hours_package"], // legacy alias
};

/** Default sub-type when a user picks a category. */
export function defaultQuoteTypeForCategory(category: QuoteCategory): QuoteType {
  switch (category) {
    case "retainer":
      return "construction_retainer";
    case "time_based":
    case "consultancy":
      return "consultancy_hours_package";
    case "project":
    default:
      return "standard_project";
  }
}

/** Derive the category for an existing quote_type — used as a safety net. */
export function categoryForQuoteType(type: QuoteType | string | null | undefined): QuoteCategory {
  if (type === "consultancy_hours_package") return "time_based";
  if (type === "construction_retainer") return "retainer";
  return "project";
}

/**
 * Normalise a category value coming from the DB so the legacy "consultancy"
 * value is treated as the new "time_based" everywhere in the UI.
 */
export function normalizeQuoteCategory(
  category: QuoteCategory | string | null | undefined,
): "project" | "time_based" | "retainer" {
  if (category === "retainer") return "retainer";
  if (category === "time_based" || category === "consultancy") return "time_based";
  return "project";
}

export type CrmAccount = {
  id: string;
  company_id: string;
  name: string;
  billing_details: string | null;
  notas: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OpportunitySource = "web" | "referral" | "repeat" | "other";

export type OpportunityActivityType = "call" | "email" | "meeting" | "note";

export type OpportunityActivity = {
  id: string;
  opportunity_id: string;
  type: OpportunityActivityType;
  content: string;
  created_by: string | null;
  created_at: string;
};

export const OPPORTUNITY_ACTIVITY_TYPES: { value: OpportunityActivityType }[] = [
  { value: "call" },
  { value: "email" },
  { value: "meeting" },
  { value: "note" },
];

export const OPPORTUNITY_SOURCES: { value: OpportunitySource }[] = [
  { value: "web" },
  { value: "referral" },
  { value: "repeat" },
  { value: "other" },
];

export type CrmOpportunity = {
  id: string;
  name: string;
  company_id: string | null;
  primary_contact_id: string | null;
  stage: OpportunityStage;
  estimated_fee: number;
  probability: number;
  expected_start_date: string | null;
  notas: string | null;
  next_action: string | null;
  next_action_date: string | null;
  source: OpportunitySource | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  last_activity_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const OPPORTUNITY_STAGES: { value: OpportunityStage; label: string; color: string }[] = [
  { value: "lead", label: "Lead", color: "bg-slate-500" },
  { value: "proposal", label: "Proposal", color: "bg-blue-500" },
  { value: "negotiation", label: "Negotiation", color: "bg-amber-500" },
  { value: "won", label: "Won", color: "bg-emerald-500" },
  { value: "lost", label: "Lost", color: "bg-rose-500" },
];

export const QUOTE_STATUSES: { value: QuoteStatus; label: string; color: string }[] = [
  { value: "draft", label: "Draft", color: "bg-slate-500" },
  { value: "sent", label: "Sent", color: "bg-blue-500" },
  { value: "approved", label: "Approved", color: "bg-emerald-500" },
  { value: "rejected", label: "Rejected", color: "bg-rose-500" },
];

export const FEE_STRUCTURE_TYPES: { value: FeeStructureType; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "staged", label: "Staged" },
  { value: "monthly", label: "Monthly" },
];

// ============================================================
// Helpers
// ============================================================

export function formatEUR(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function contactFullName(c: Pick<Contact, "titulo" | "primeiro_nome" | "apelido">) {
  return [c.titulo, c.primeiro_nome, c.apelido].filter(Boolean).join(" ");
}
