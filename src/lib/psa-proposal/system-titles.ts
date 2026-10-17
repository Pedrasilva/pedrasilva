/**
 * System block headings follow the proposal language at render time.
 *
 * Blocks store whatever heading was inserted (historically the PT default).
 * A stored heading that equals any known system default for that block kind
 * (in either language, incl. legacy variants and "(cópia)" copies) is a
 * system heading and is shown in the proposal language. Anything else was
 * written by the user and is shown verbatim. Nothing is written back, so
 * switching language is instant and reversible, and editor, preview, PDF and
 * signed snapshots (all rendered through the canvas) agree.
 */
import type { ProposalLang } from "./live-data";

type Pair = { en: string; pt: string; aliases?: string[] };

export const SYSTEM_BLOCK_TITLES: Record<string, Pair> = {
  cover: { en: "Cover", pt: "Capa" },
  index: { en: "Index", pt: "Índice", aliases: ["Contents", "Table of Contents"] },
  about: { en: "About PSA", pt: "Sobre a PSA" },
  scope: { en: "Scope & Project Description", pt: "Âmbito e Descrição do Projeto", aliases: ["Scope and Project Description"] },
  stage_list: { en: "Project Organization & Stages", pt: "Organização do Projeto e Fases", aliases: ["Project Organization and Stages", "Project Organisation & Stages"] },
  stage_item: { en: "Stage", pt: "Fase", aliases: ["Stage Item", "Individual Stage"] },
  timeline: { en: "Timeline", pt: "Cronograma" },
  gantt_design: { en: "Design Schedule", pt: "Cronograma de Projeto", aliases: ["Design Gantt"] },
  gantt_construction: { en: "Construction Schedule", pt: "Cronograma de Obra", aliases: ["Construction Gantt"] },
  gantt_partial: { en: "Schedule — Stage", pt: "Cronograma — Fase", aliases: ["Gantt Parcial", "Partial Gantt"] },
  consultants: { en: "Consultants Sub-Contracting", pt: "Consultores e Subcontratação" },
  fee_table: { en: "Fee Proposal", pt: "Proposta de Honorários" },
  construction_fee: { en: "Construction-Stage Fee", pt: "Honorários em Obra" },
  supplier_fee_table: { en: "Fees — Suppliers", pt: "Honorários — Fornecedores", aliases: ["Honorários Fornecedores"] },
  optional_fee_table: { en: "Optional Services", pt: "Serviços Opcionais", aliases: ["Honorários Opcionais"] },
  payment_terms: { en: "Payment Terms", pt: "Condições de Pagamento" },
  payment_schedule: { en: "Payment Schedule", pt: "Plano de Pagamentos", aliases: ["Payment_schedule_construction"] },
  additional_services: { en: "Additional Services", pt: "Serviços Adicionais" },
  general: { en: "General Considerations", pt: "Considerações Gerais" },
  suspension: { en: "Suspension or Termination", pt: "Suspensão ou Rescisão" },
  exclusions: { en: "Exclusions", pt: "Exclusões" },
  acceptance: { en: "Validity & Acceptance", pt: "Validade e Aceitação" },
  custom_text: { en: "New block", pt: "Novo bloco", aliases: ["Texto Livre"] },
  travel_expenses: { en: "Travel Expenses", pt: "Despesas de Deslocação" },
  billable_hourly_rate: { en: "Billable Hourly Rate", pt: "Valor/hora Facturável" },
  image: { en: "Image", pt: "Imagem" },
  page_break: { en: "Page Break", pt: "Quebra de Página" },
  appendix_index: { en: "Appendices", pt: "Anexos", aliases: ["Índice de Anexos"] },
  appendix_payment_schedule: { en: "Monthly Payment Schedule", pt: "Cronograma Mensal de Pagamentos" },
  appendix_gantt: { en: "Project Programme", pt: "Programa do Projeto" },
  appendix_general_terms: { en: "General Terms of Engagement", pt: "Termos Gerais de Prestação de Serviços" },
};

const norm = (s: string) => s.replace(/\s*\((?:cópia|copia|copy)\)\s*$/i, "").replace(/\s+/g, " ").trim().toLowerCase();

/** True when the stored heading is a system default (any language) for its kind. */
export function isSystemBlockTitle(kind: string, title: string | null | undefined): boolean {
  const pair = SYSTEM_BLOCK_TITLES[kind];
  if (!pair) return false;
  const t = norm(title ?? "");
  if (!t) return true;
  return [pair.en, pair.pt, ...(pair.aliases ?? [])].some((v) => norm(v) === t);
}

/** Heading to display: system default in the proposal language, or the user's text. */
export function resolveBlockTitle(kind: string, title: string | null | undefined, lang: ProposalLang): string {
  const pair = SYSTEM_BLOCK_TITLES[kind];
  if (!pair || !isSystemBlockTitle(kind, title)) return title ?? "";
  return lang === "en" ? pair.en : pair.pt;
}
