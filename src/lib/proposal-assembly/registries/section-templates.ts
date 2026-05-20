/**
 * V1 section templates — workplace / large_corporate_fitout / psa_led.
 *
 * Narratives are seeded text (EN + PT). Users may rewrite them freely once
 * inserted; the assembly engine only fills them in for the first time.
 *
 * Tone targets: architectural, coordination-aware, operationally credible,
 * close to PSA's real proposal corpus. Avoid generic consultancy boilerplate,
 * avoid filler sentences, keep paragraphs tight (2–4 lines).
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

/**
 * Per-phase narrative seeds for the workplace large-corporate-fitout / PSA-led
 * template. Keys are PSA stage codes. The assembler falls back to a generic
 * one-liner when a stage code is not present here (e.g. ad-hoc stages).
 *
 * Construction Assistance is explicitly framed as a monthly retainer service,
 * not a fixed-deliverables package.
 */
export interface PhaseTemplate {
  titleEn: string;
  titlePt: string;
  bodyEn: string;
  bodyPt: string;
}

export const WORKPLACE_PHASE_TEMPLATES: Record<string, PhaseTemplate> = {
  P1: {
    titleEn: "Phase 1 — Workplace Strategy",
    titlePt: "Fase 1 — Estratégia de Workplace",
    bodyEn:
      "We establish the brief through stakeholder interviews, headcount and growth modelling, " +
      "and a workplace diagnostic of the existing operation. Outputs include a programme of " +
      "spaces, adjacency diagrams and a validated test-fit against the target floorplate. " +
      "Duration: {phase_duration_P1} working days. Fee: {phase_fee_P1}.",
    bodyPt:
      "Estabelecemos o briefing através de entrevistas com stakeholders, modelação de headcount " +
      "e crescimento, e diagnóstico do workplace existente. Os outputs incluem o programa de " +
      "espaços, diagramas de adjacências e um test-fit validado contra a planta-alvo. " +
      "Duração: {phase_duration_P1} dias úteis. Honorários: {phase_fee_P1}.",
  },
  P2: {
    titleEn: "Phase 2 — Concept Design",
    titlePt: "Fase 2 — Projecto de Conceito",
    bodyEn:
      "Spatial concept, design language and key materiality are defined and tested against " +
      "the strategic brief. Deliverables include concept plans, character imagery, " +
      "preliminary FF&E direction and a coordination kick-off with base-building and MEP. " +
      "Duration: {phase_duration_P2} working days. Fee: {phase_fee_P2}.",
    bodyPt:
      "Definimos o conceito espacial, a linguagem de projecto e a materialidade-chave, " +
      "validados contra o briefing estratégico. Entregáveis incluem plantas de conceito, " +
      "imagens de carácter, orientação preliminar de FF&E e kick-off de coordenação com " +
      "base-building e MEP. Duração: {phase_duration_P2} dias úteis. Honorários: {phase_fee_P2}.",
  },
  P3: {
    titleEn: "Phase 3 — Schematic / Developed Design",
    titlePt: "Fase 3 — Projecto Base / Desenvolvido",
    bodyEn:
      "The concept is developed to a coordinated schematic design integrating architecture, " +
      "MEP, structure, AV and security. Outputs include developed plans, RCPs, key sections, " +
      "FF&E schedule v1 and a cost-plan alignment with the QS. " +
      "Duration: {phase_duration_P3} working days. Fee: {phase_fee_P3}.",
    bodyPt:
      "Desenvolvemos o conceito até ao projecto base coordenado, integrando arquitectura, " +
      "MEP, estrutura, AV e segurança. Outputs incluem plantas desenvolvidas, RCPs, cortes-chave, " +
      "mapa de FF&E v1 e alinhamento do cost-plan com o QS. " +
      "Duração: {phase_duration_P3} dias úteis. Honorários: {phase_fee_P3}.",
  },
  P4: {
    titleEn: "Phase 4 — Technical Design",
    titlePt: "Fase 4 — Projecto de Execução",
    bodyEn:
      "Tender-ready technical documentation: detail drawings, finishes schedules, joinery and " +
      "FF&E specifications, and full consultant coordination. Output is a fully coordinated " +
      "tender package suitable for fixed-price bidding. " +
      "Duration: {phase_duration_P4} working days. Fee: {phase_fee_P4}.",
    bodyPt:
      "Documentação técnica pronta para concurso: desenhos de pormenor, mapas de acabamentos, " +
      "especificações de carpintarias e FF&E, e coordenação completa de consultores. O output é " +
      "um caderno de encargos coordenado, apto a concurso de preço fixo. " +
      "Duração: {phase_duration_P4} dias úteis. Honorários: {phase_fee_P4}.",
  },
  P5: {
    titleEn: "Phase 5 — Procurement / Tender Support",
    titlePt: "Fase 5 — Apoio ao Concurso",
    bodyEn:
      "We support the client through contractor pre-qualification, tender clarifications, " +
      "technical scoring, value engineering review and award recommendation. Engagement is " +
      "scoped to the tender window agreed with the client and QS. " +
      "Duration: {phase_duration_P5} working days. Fee: {phase_fee_P5}.",
    bodyPt:
      "Apoiamos o cliente na pré-qualificação de empreiteiros, esclarecimentos a concurso, " +
      "avaliação técnica, revisão de value engineering e recomendação de adjudicação. O " +
      "envolvimento é dimensionado para a janela de concurso acordada com o cliente e o QS. " +
      "Duração: {phase_duration_P5} dias úteis. Honorários: {phase_fee_P5}.",
  },
  P6: {
    titleEn: "Phase 6 — Construction Assistance (Monthly Retainer)",
    titlePt: "Fase 6 — Assistência à Obra (Retainer Mensal)",
    bodyEn:
      "Construction assistance is delivered as a monthly retainer over " +
      "{construction_duration} months at {construction_monthly_fee} per month " +
      "({construction_monthly_hours} hours/month). Scope includes site visits, RFI responses, " +
      "shop-drawing and sample review, snag management and design intent safeguarding. " +
      "It is a time-based operational service, not a fixed-deliverable package.",
    bodyPt:
      "A assistência à obra é prestada como retainer mensal durante {construction_duration} " +
      "meses ao valor de {construction_monthly_fee} por mês ({construction_monthly_hours} " +
      "horas/mês). O âmbito inclui visitas a obra, resposta a RFIs, revisão de desenhos de " +
      "fabrico e amostras, gestão de listas de remates e salvaguarda do design intent. " +
      "É um serviço operacional baseado em tempo, não um pacote de entregáveis fixos.",
  },
  CA: {
    titleEn: "Construction Assistance (Monthly Retainer)",
    titlePt: "Assistência à Obra (Retainer Mensal)",
    bodyEn:
      "Construction assistance is delivered as a monthly retainer over " +
      "{construction_duration} months at {construction_monthly_fee} per month " +
      "({construction_monthly_hours} hours/month). Scope includes site visits, RFI responses, " +
      "shop-drawing and sample review, snag management and design intent safeguarding. " +
      "It is a time-based operational service, not a fixed-deliverable package.",
    bodyPt:
      "A assistência à obra é prestada como retainer mensal durante {construction_duration} " +
      "meses ao valor de {construction_monthly_fee} por mês ({construction_monthly_hours} " +
      "horas/mês). O âmbito inclui visitas a obra, resposta a RFIs, revisão de desenhos de " +
      "fabrico e amostras, gestão de listas de remates e salvaguarda do design intent. " +
      "É um serviço operacional baseado em tempo, não um pacote de entregáveis fixos.",
  },
  P7: {
    titleEn: "Phase 7 — Close Out",
    titlePt: "Fase 7 — Encerramento",
    bodyEn:
      "Practical completion walk-through, snag-list close-out, as-built coordination with the " +
      "contractor, handover of the operations and maintenance pack, and a post-occupancy " +
      "review at 8–12 weeks. " +
      "Duration: {phase_duration_P7} working days. Fee: {phase_fee_P7}.",
    bodyPt:
      "Vistoria de recepção provisória, encerramento de remates, coordenação de telas finais " +
      "com o empreiteiro, entrega do dossier de operação e manutenção, e revisão pós-ocupação " +
      "às 8–12 semanas. " +
      "Duração: {phase_duration_P7} dias úteis. Honorários: {phase_fee_P7}.",
  },
};

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
      "Dear {client_name},\n\n" +
      "Thank you for the opportunity to propose on {project_name}. The following document " +
      "sets out our methodology, programme and commercial terms for the workplace fit-out, " +
      "delivered under our PSA-led model with end-to-end design and coordination responsibility.\n\n" +
      "We have structured the engagement so each design stage is a fixed-fee deliverable, " +
      "while construction assistance runs as a transparent monthly retainer aligned with the " +
      "site programme. Attachments I–VI carry the conditions, deliverables matrix, programme " +
      "and fee schedule for the procurement team.\n\n" +
      "We remain available for any clarification.",
    bodyPt:
      "Caro(a) {client_name},\n\n" +
      "Agradecemos a oportunidade de apresentar proposta para {project_name}. Este documento " +
      "descreve a metodologia, o programa e os termos comerciais para a empreitada de fit-out, " +
      "ao abrigo do nosso modelo PSA-led, com responsabilidade integral de projecto e coordenação.\n\n" +
      "A contratação está estruturada de forma a que cada fase de projecto seja um entregável " +
      "de honorários fixos, enquanto a assistência à obra decorre como retainer mensal " +
      "transparente, alinhado com o programa de obra. Os Anexos I–VI reúnem condições, matriz " +
      "de entregáveis, programa e calendário de honorários para a equipa de procurement.\n\n" +
      "Permanecemos disponíveis para qualquer esclarecimento.",
  },
  executive_summary: {
    titleEn: "Executive Summary",
    titlePt: "Sumário Executivo",
    bodyEn:
      "{project_name} is a large corporate workplace fit-out for {client_name}, delivered " +
      "under PSA's integrated design and coordination model. The overall programme runs for " +
      "{overall_project_duration} working days across briefing, design, tender and close-out.\n\n" +
      "Construction is supported through a monthly retainer over {construction_duration} months " +
      "at {construction_monthly_fee} per month ({construction_monthly_hours} hours/month), " +
      "ensuring design intent and coordination continuity from site mobilisation to handover.",
    bodyPt:
      "{project_name} é um fit-out de escritórios corporativos de grande dimensão para " +
      "{client_name}, entregue ao abrigo do modelo integrado de projecto e coordenação da PSA. " +
      "O programa global decorre durante {overall_project_duration} dias úteis, cobrindo " +
      "briefing, projecto, concurso e encerramento.\n\n" +
      "A obra é acompanhada por retainer mensal durante {construction_duration} meses ao valor " +
      "de {construction_monthly_fee} por mês ({construction_monthly_hours} horas/mês), " +
      "garantindo continuidade de design intent e coordenação desde a mobilização até à recepção.",
  },
  project_understanding: {
    titleEn: "Project Understanding",
    titlePt: "Compreensão do Projecto",
    bodyEn:
      "{client_name} requires a workplace that supports focused work, collaboration and brand " +
      "presence, with the operational rigour expected of a large corporate occupier. We read " +
      "the project as a coordination exercise as much as a design one: spatial planning, " +
      "building services alignment, FF&E procurement and tenant-fit interface with the " +
      "base-building all need to land on the same date.",
    bodyPt:
      "{client_name} pretende um workplace que suporte trabalho focado, colaboração e presença " +
      "de marca, com o rigor operacional esperado de um grande ocupante corporativo. Lemos o " +
      "projecto tanto como um exercício de coordenação como de desenho: planeamento espacial, " +
      "alinhamento de especialidades, procurement de FF&E e interface tenant-fit com a " +
      "base-building têm de convergir na mesma data.",
  },
  design_approach: {
    titleEn: "Design Approach",
    titlePt: "Abordagem de Projecto",
    bodyEn:
      "Our approach for {project_name} balances functional rigour with material restraint. We " +
      "work in short iterative cycles with the client team, decisions are validated against " +
      "budget, programme and operational drivers, and each milestone is signed off before the " +
      "next phase opens. Coordination with consultants, landlord and contractor is embedded " +
      "throughout the {overall_project_duration}-day programme rather than reserved to a " +
      "single technical phase.",
    bodyPt:
      "A nossa abordagem para {project_name} equilibra rigor funcional com contenção material. " +
      "Trabalhamos em ciclos curtos e iterativos com a equipa do cliente, validamos decisões " +
      "contra orçamento, programa e drivers operacionais, e cada marco é aprovado antes da " +
      "abertura da fase seguinte. A coordenação com consultores, senhorio e empreiteiro está " +
      "embebida ao longo dos {overall_project_duration} dias do programa, não reservada a uma " +
      "única fase técnica.",
  },
  scope_overview: {
    titleEn: "Scope Overview",
    titlePt: "Âmbito Geral",
    bodyEn:
      "Scope covers all design stages from briefing through tender and into construction " +
      "assistance and close-out. Deliverables per phase — drawings, schedules, specifications " +
      "and meeting cadence — are itemised in the matrix in Attachment II. Programme is in " +
      "Attachment III, fees and payment milestones in Attachment IV.",
    bodyPt:
      "O âmbito cobre todas as fases de projecto, do briefing ao concurso, passando pela " +
      "assistência à obra e encerramento. Os entregáveis por fase — desenhos, mapas, " +
      "especificações e cadência de reuniões — estão detalhados na matriz do Anexo II. O " +
      "programa consta do Anexo III e os honorários e marcos de pagamento do Anexo IV.",
  },
  phase_narratives: {
    titleEn: "Phases",
    titlePt: "Fases",
    bodyEn:
      "The phases below describe what each stage delivers and how it interfaces with the " +
      "consultant team and the contractor. Fixed-fee stages are signed off individually; " +
      "construction assistance runs as a monthly retainer. Durations and fees are summarised " +
      "in the fee section and itemised in Attachment IV.",
    bodyPt:
      "As fases que se seguem descrevem o que cada etapa entrega e como interage com a equipa " +
      "de consultores e o empreiteiro. As fases de honorários fixos são aprovadas " +
      "individualmente; a assistência à obra decorre como retainer mensal. As durações e " +
      "honorários estão resumidos na secção de honorários e detalhados no Anexo IV.",
  },
  fee_summary: {
    titleEn: "Fee Summary",
    titlePt: "Resumo de Honorários",
    bodyEn:
      "The fee summary below sets out the fixed-fee project stages and the construction-" +
      "assistance retainer. Detailed breakdown and payment milestones are in Attachment IV.\n\n" +
      "{project_stage_fee_table}\n\n{construction_stage_fee_table}",
    bodyPt:
      "O quadro abaixo apresenta os honorários por fase de projecto (preço fixo) e o retainer " +
      "de assistência à obra. O detalhe completo e os marcos de pagamento constam do Anexo IV.\n\n" +
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

export function lookupPhaseTemplate(
  family: ProposalFamily,
  preset: ProposalPreset,
  deliveryMode: ProposalDeliveryMode,
  stageCode: string,
): PhaseTemplate | null {
  if (
    family === "workplace" &&
    preset === "large_corporate_fitout" &&
    deliveryMode === "psa_led"
  ) {
    return WORKPLACE_PHASE_TEMPLATES[stageCode] ?? null;
  }
  return null;
}
