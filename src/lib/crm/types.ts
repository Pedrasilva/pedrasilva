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

export type CrmOpportunity = {
  id: string;
  name: string;
  company_id: string;
  primary_contact_id: string | null;
  stage: OpportunityStage;
  estimated_fee: number;
  probability: number;
  expected_start_date: string | null;
  notas: string | null;
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
