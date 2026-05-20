/**
 * V1 section templates — workplace / large_corporate_fitout / psa_led.
 *
 * Narratives are seeded text (EN + PT). Users may rewrite them freely once
 * inserted; the assembly engine only fills them in for the first time.
 *
 * To extend with new families/presets, add a new key under SECTION_TEMPLATES
 * keyed by `${family}:${preset}:${deliveryMode}`.
 */
import type {
  AssemblyMainSectionId,
  ProposalFamily,
  ProposalPreset,
  ProposalDeliveryMode,
} from "../types";

export interface SectionTemplate {
  titleEn: string;
  titlePt: string;
  bodyEn: string;
  bodyPt: string;
}

export type SectionTemplateMap = Record<AssemblyMainSectionId, SectionTemplate>;

function key(f: ProposalFamily, p: ProposalPreset, m: ProposalDeliveryMode) {
  return `${f}:${p}:${m}`;
}

const WORKPLACE_LARGE_PSA: SectionTemplateMap = {
  cover_page: {
    titleEn: "Cover Page",
    titlePt: "Capa",
    bodyEn:
      "{project_name}\nProposal {proposal_version} — {proposal_date}\nPrepared for {client_name}",
    bodyPt:
      "{project_name}\nProposta {proposal_version} — {proposal_date}\nPreparada para {client_name}",
  },
  cover_letter: {
    titleEn: "Cover Letter",
    titlePt: "Carta de Apresentação",
    bodyEn:
      "Dear {client_name},\n\nWe are pleased to submit this proposal for {project_name}. " +
      "This document describes our methodology, programme and commercial terms for the workplace " +
      "fit-out engagement, delivered under our PSA-led model.",
    bodyPt:
      "Caro(a) {client_name},\n\nApresentamos a nossa proposta para {project_name}. " +
      "Este documento descreve a metodologia, o programa e os termos comerciais para a empreitada " +
      "de fit-out, entregue ao abrigo do nosso modelo PSA-led.",
  },
  executive_summary: {
    titleEn: "Executive Summary",
    titlePt: "Sumário Executivo",
    bodyEn:
      "This proposal covers the design and delivery of a large corporate workplace fit-out for {client_name}. " +
      "The overall programme runs for {overall_project_duration} working days, with construction " +
      "assistance over {construction_duration} months at a monthly fee of {construction_monthly_fee}.",
    bodyPt:
      "Esta proposta cobre o projeto e a execução de um fit-out de escritórios corporativos para {client_name}. " +
      "O programa global decorre durante {overall_project_duration} dias úteis, com assistência à obra " +
      "ao longo de {construction_duration} meses ao valor mensal de {construction_monthly_fee}.",
  },
  project_understanding: {
    titleEn: "Project Understanding",
    titlePt: "Compreensão do Projecto",
    bodyEn:
      "We understand {client_name} requires a workplace solution that supports collaboration, " +
      "focused work and brand presence. Our approach addresses spatial planning, building services " +
      "coordination, FF&E selection and tenant-fit alignment with the base-building.",
    bodyPt:
      "Compreendemos que {client_name} pretende uma solução de escritórios que suporte colaboração, " +
      "trabalho focado e presença de marca. A nossa abordagem cobre planeamento espacial, coordenação " +
      "de especialidades, selecção de mobiliário e articulação com a base-building.",
  },
  design_approach: {
    titleEn: "Design Approach",
    titlePt: "Abordagem de Projecto",
    bodyEn:
      "Our design approach for {project_name} balances functional rigour with material restraint. " +
      "We work in iterative cycles with the client team and validate decisions against budget, " +
      "programme and operational drivers throughout the {overall_project_duration}-day programme.",
    bodyPt:
      "A nossa abordagem de projecto para {project_name} equilibra rigor funcional com contenção material. " +
      "Trabalhamos em ciclos iterativos com a equipa do cliente e validamos as decisões contra orçamento, " +
      "programa e drivers operacionais ao longo dos {overall_project_duration} dias do programa.",
  },
  scope_overview: {
    titleEn: "Scope Overview",
    titlePt: "Âmbito Geral",
    bodyEn:
      "The scope covers all design stages from briefing through to construction assistance and " +
      "post-occupancy support. A detailed deliverables matrix is included in Attachment II.",
    bodyPt:
      "O âmbito cobre todas as fases de projecto, desde o briefing até à assistência à obra e ao " +
      "acompanhamento pós-ocupação. Uma matriz detalhada de entregáveis encontra-se no Anexo II.",
  },
  phase_narratives: {
    titleEn: "Phases",
    titlePt: "Fases",
    bodyEn:
      "Each project phase is described below. Detailed durations and fees are summarised in the " +
      "fee section and in Attachment IV.",
    bodyPt:
      "Cada fase do projecto está descrita em seguida. As durações e honorários detalhados constam " +
      "da secção de honorários e do Anexo IV.",
  },
  fee_summary: {
    titleEn: "Fee Summary",
    titlePt: "Resumo de Honorários",
    bodyEn:
      "The fee summary below sets out the project-stage fees and the construction-assistance retainer. " +
      "{project_stage_fee_table}\n\n{construction_stage_fee_table}",
    bodyPt:
      "O quadro abaixo apresenta os honorários por fase de projecto e o retainer de assistência à obra. " +
      "{project_stage_fee_table}\n\n{construction_stage_fee_table}",
  },
  signature: {
    titleEn: "Signature",
    titlePt: "Assinatura",
    bodyEn:
      "Signed for and on behalf of Pedra Silva Architects:\n\n_____________________________\n\n" +
      "Date: {proposal_date}",
    bodyPt:
      "Pela Pedra Silva Architects:\n\n_____________________________\n\nData: {proposal_date}",
  },
};

export const SECTION_TEMPLATES: Record<string, SectionTemplateMap> = {
  [key("workplace", "large_corporate_fitout", "psa_led")]: WORKPLACE_LARGE_PSA,
};

export function lookupSectionTemplate(
  family: ProposalFamily,
  preset: ProposalPreset,
  deliveryMode: ProposalDeliveryMode,
  sectionId: AssemblyMainSectionId,
): SectionTemplate | null {
  const map = SECTION_TEMPLATES[key(family, preset, deliveryMode)];
  if (!map) return null;
  return map[sectionId] ?? null;
}
