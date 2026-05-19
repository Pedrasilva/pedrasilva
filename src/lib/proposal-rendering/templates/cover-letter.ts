/**
 * Deterministic cover letter templates — NO AI generation.
 * Tokens use {{token}} syntax (see utils/tokens.ts).
 */
import type { Locale, ProposalRenderKind } from "../types";

interface CoverLetterTemplate {
  greeting: string;
  paragraphs: string[];
  closing: string;
  signatory: string;
}

function en(kind: ProposalRenderKind): CoverLetterTemplate {
  const intro =
    kind === "umbrella"
      ? "Thank you for the invitation to act as your long-term architectural partner."
      : "Thank you for the invitation to submit our proposal for {{project_name}}.";
  return {
    greeting: "Dear {{contact_name}},",
    paragraphs: [
      intro,
      "Following our review of the brief, we are pleased to share the following proposal, which sets out our understanding of the scope, our proposed methodology and the associated commercial terms.",
      "The work is structured around the canonical phases that govern our practice, adapted to the specifics of this engagement and to the {{family_label}} context in which it sits.",
      "{{firm_name}} brings a senior, multidisciplinary team and a coordinated approach across design, technical resolution and construction assistance — at {{project_location}} and throughout the lifecycle of the project.",
      "We remain available for any clarification or refinement of the present document and look forward to a productive collaboration.",
    ],
    closing: "Kind regards,",
    signatory: "{{firm_name}}",
  };
}

function pt(kind: ProposalRenderKind): CoverLetterTemplate {
  const intro =
    kind === "umbrella"
      ? "Agradecemos o convite para ser o vosso parceiro arquitetónico de longo prazo."
      : "Agradecemos o convite para apresentarmos a nossa proposta para {{project_name}}.";
  return {
    greeting: "Estimado(a) {{contact_name}},",
    paragraphs: [
      intro,
      "Após análise do briefing, temos o prazer de apresentar a presente proposta, que reflete a nossa interpretação do âmbito, a metodologia proposta e as condições comerciais associadas.",
      "O trabalho organiza-se em torno do faseamento canónico que estrutura a nossa prática, adaptado às especificidades desta encomenda e ao contexto de {{family_label}} em que se insere.",
      "A {{firm_name}} disponibiliza uma equipa sénior multidisciplinar e uma abordagem coordenada entre conceção, resolução técnica e assistência à obra — em {{project_location}} e ao longo de todo o ciclo do projeto.",
      "Permanecemos disponíveis para qualquer esclarecimento ou afinação do presente documento e aguardamos uma colaboração proveitosa.",
    ],
    closing: "Com os melhores cumprimentos,",
    signatory: "{{firm_name}}",
  };
}

export function getCoverLetterTemplate(
  locale: Locale,
  kind: ProposalRenderKind,
): CoverLetterTemplate {
  return locale === "pt-PT" ? pt(kind) : en(kind);
}
