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
    titleEn: "Phase 1 — Workplace Strategy / Programme Definition",
    titlePt: "Fase 1 — Estratégia de Workplace / Definição de Programa",
    bodyEn:
      "Narrative: We establish the project brief through stakeholder interviews, headcount and growth modelling, and a workplace diagnostic of the existing operation.\n" +
      "Key tasks: briefing workshops; workplace observation; area benchmark review; programme of spaces; adjacency and operational-priority mapping.\n" +
      "Deliverables: validated brief, space programme, adjacency diagrams, test-fit assumptions and decision register.\n" +
      "Coordination notes: client leadership, HR/operations, IT and facilities inputs are consolidated before concept design begins.",
    bodyPt:
      "Narrativa: Estabelecemos o briefing através de entrevistas com stakeholders, modelação de headcount e crescimento, e diagnóstico do workplace existente.\n" +
      "Tarefas-chave: workshops de briefing; observação do workplace; revisão de benchmarks de área; programa de espaços; mapeamento de adjacências e prioridades operacionais.\n" +
      "Entregáveis: briefing validado, programa de espaços, diagramas de adjacências, pressupostos de test-fit e registo de decisões.\n" +
      "Notas de coordenação: inputs de liderança, HR/operações, IT e facilities são consolidados antes do início do conceito.",
  },
  P2: {
    titleEn: "Phase 2 — Concept Design",
    titlePt: "Fase 2 — Projecto de Conceito",
    bodyEn:
      "Narrative: Spatial concept, design language and key materiality are defined and tested against the strategic brief.\n" +
      "Key tasks: concept planning; look-and-feel direction; material and workplace-setting studies; early budget alignment; base-building and MEP coordination kick-off.\n" +
      "Deliverables: concept plans, mood/material direction, preliminary FF&E direction, key precedent imagery and concept-stage coordination notes.\n" +
      "Coordination notes: concept options are reviewed with the client and consultant team before a preferred direction is frozen.",
    bodyPt:
      "Narrativa: Definimos o conceito espacial, a linguagem de projecto e a materialidade-chave, validados contra o briefing estratégico.\n" +
      "Tarefas-chave: plantas de conceito; direcção visual; estudos de materiais e settings de workplace; alinhamento preliminar de orçamento; kick-off de coordenação com base-building e MEP.\n" +
      "Entregáveis: plantas de conceito, direcção de materiais, orientação preliminar de FF&E, imagens de referência e notas de coordenação da fase.\n" +
      "Notas de coordenação: opções de conceito são revistas com cliente e consultores antes de congelar a direcção preferencial.",
  },
  P3: {
    titleEn: "Phase 3 — Schematic / Developed Design",
    titlePt: "Fase 3 — Projecto Base / Desenvolvido",
    bodyEn:
      "Narrative: The approved concept is developed into a coordinated schematic design integrating architecture, MEP, structure, AV, security and workplace operational requirements.\n" +
      "Key tasks: developed plans; reflected ceiling and lighting coordination; key sections and elevations; finishes strategy; FF&E schedule v1; QS cost-plan alignment.\n" +
      "Deliverables: developed drawing package, outline specifications, FF&E schedule v1, coordinated consultant comments and cost-plan review notes.\n" +
      "Coordination notes: design decisions are checked against budget, programme, landlord constraints and consultant interfaces before technical design.",
    bodyPt:
      "Narrativa: O conceito aprovado é desenvolvido para projecto base coordenado, integrando arquitectura, MEP, estrutura, AV, segurança e requisitos operacionais de workplace.\n" +
      "Tarefas-chave: plantas desenvolvidas; coordenação de tectos e iluminação; cortes e alçados-chave; estratégia de acabamentos; mapa de FF&E v1; alinhamento com cost-plan do QS.\n" +
      "Entregáveis: pacote de desenho desenvolvido, especificações preliminares, mapa FF&E v1, comentários coordenados de consultores e notas de revisão de custo.\n" +
      "Notas de coordenação: decisões são verificadas contra orçamento, programa, constrangimentos de landlord e interfaces de consultores antes do projecto técnico.",
  },
  P4: {
    titleEn: "Phase 4 — Developed / Schematic Design",
    titlePt: "Fase 4 — Anteprojeto / Projecto Desenvolvido",
    bodyEn:
      "Narrative: Developed design resolves the selected concept into a client-approved, consultant-coordinated package ready to move into technical documentation.\n" +
      "Key tasks: room-by-room design development; finishes and joinery intent; furniture layouts; consultant coordination workshops; budget and programme checkpoint.\n" +
      "Deliverables: developed plans, RCPs, key elevations/sections, finishes outline, FF&E intent and coordinated design issues log.\n" +
      "Coordination notes: this phase closes open design assumptions before the technical package is produced.",
    bodyPt:
      "Narrativa: O anteprojeto resolve o conceito seleccionado num pacote aprovado pelo cliente e coordenado com consultores, pronto para documentação técnica.\n" +
      "Tarefas-chave: desenvolvimento por espaço; intenção de acabamentos e carpintarias; layouts de mobiliário; workshops de coordenação; checkpoint de orçamento e programa.\n" +
      "Entregáveis: plantas desenvolvidas, RCPs, alçados/cortes-chave, mapa preliminar de acabamentos, intenção FF&E e log de temas coordenados.\n" +
      "Notas de coordenação: esta fase fecha pressupostos de design antes da produção do pacote técnico.",
  },
  P5: {
    titleEn: "Phase 5 — Technical Design",
    titlePt: "Fase 5 — Projecto de Execução",
    bodyEn:
      "Narrative: Technical design converts the approved design into a coordinated tender/construction package.\n" +
      "Key tasks: technical drawings; details; finishes schedules; joinery and FF&E specifications; coordination with MEP, structure, AV, security and fire consultants.\n" +
      "Deliverables: tender-ready drawing set, schedules, outline specifications, coordinated consultant package and design-risk register.\n" +
      "Coordination notes: the package is prepared so contractors can price on a consistent technical basis.",
    bodyPt:
      "Narrativa: O projecto de execução transforma o desenho aprovado num pacote técnico coordenado para concurso/obra.\n" +
      "Tarefas-chave: desenhos técnicos; pormenores; mapas de acabamentos; especificações de carpintarias e FF&E; coordenação com MEP, estrutura, AV, segurança e incêndio.\n" +
      "Entregáveis: pacote de desenhos para concurso, mapas, especificações, pacote coordenado de consultores e registo de riscos de projecto.\n" +
      "Notas de coordenação: o pacote é preparado para permitir preços de empreiteiro sobre uma base técnica consistente.",
  },
  P6: {
    titleEn: "Phase 6 — Procurement / Tender Support",
    titlePt: "Fase 6 — Procurement / Apoio ao Concurso",
    bodyEn:
      "Narrative: We support the client through procurement so the tendered scope remains aligned with the approved design intent and commercial baseline.\n" +
      "Key tasks: contractor pre-qualification support; tender clarifications; addenda; technical scoring; value-engineering review; award recommendation input.\n" +
      "Deliverables: clarification log, tender-response notes, technical evaluation input, value-engineering commentary and award recommendation support.\n" +
      "Coordination notes: PSA coordinates design responses with QS, client procurement and consultants during the tender window.",
    bodyPt:
      "Narrativa: Apoiamos o cliente no procurement para que o âmbito em concurso permaneça alinhado com o design intent aprovado e a base comercial.\n" +
      "Tarefas-chave: apoio à pré-qualificação de empreiteiros; esclarecimentos; adendas; avaliação técnica; revisão de value engineering; apoio à recomendação de adjudicação.\n" +
      "Entregáveis: log de esclarecimentos, notas de resposta a concurso, input de avaliação técnica, comentários de value engineering e apoio à recomendação.\n" +
      "Notas de coordenação: a PSA coordena respostas de projecto com QS, procurement do cliente e consultores durante a janela de concurso.",
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
    titleEn: "Phase 7 — Construction Assistance (Monthly Retainer)",
    titlePt: "Fase 7 — Assistência à Obra (Retainer Mensal)",
    bodyEn:
      "Narrative: Construction Assistance is a time-based operational service, delivered as a monthly retainer aligned with the confirmed construction programme rather than as a fixed-deliverable package.\n" +
      "Key tasks: site visits; RFI responses; shop-drawing and sample review; coordination issue resolution; snag management; design-intent safeguarding.\n" +
      "Deliverables: site-visit notes, RFI/design responses, reviewed samples or shop drawings, snag inputs and design-intent clarifications.\n" +
      "Coordination notes: PSA supports the contractor, consultants and client team through agreed meetings and response windows during construction.",
    bodyPt:
      "Narrativa: A Assistência à Obra é um serviço operacional baseado em tempo, prestado como retainer mensal alinhado com o programa de obra confirmado e não como pacote de entregáveis fixos.\n" +
      "Tarefas-chave: visitas a obra; resposta a RFIs; revisão de desenhos de fabrico e amostras; resolução de temas de coordenação; gestão de remates; salvaguarda de design intent.\n" +
      "Entregáveis: notas de visita, respostas RFI/design, amostras ou desenhos revistos, inputs de snagging e esclarecimentos de design intent.\n" +
      "Notas de coordenação: a PSA apoia empreiteiro, consultores e cliente através de reuniões e janelas de resposta acordadas durante a obra.",
  },
  P8: {
    titleEn: "Phase 8 — Close Out / Handover",
    titlePt: "Fase 8 — Encerramento / Entrega",
    bodyEn:
      "Narrative: Close Out consolidates completion, handover and lessons learned so the workplace can move into operation with clear records.\n" +
      "Key tasks: practical-completion walk-through; snag-list close-out support; as-built coordination with the contractor; O&M pack review; post-occupancy review planning.\n" +
      "Deliverables: close-out notes, snag status input, handover/O&M review comments, as-built coordination comments and post-occupancy review agenda.\n" +
      "Coordination notes: PSA closes design and coordination issues with the contractor and client facilities team before final handover.",
    bodyPt:
      "Narrativa: O encerramento consolida conclusão, entrega e aprendizagem para que o workplace entre em operação com registos claros.\n" +
      "Tarefas-chave: vistoria de recepção provisória; apoio ao fecho de remates; coordenação de telas finais com empreiteiro; revisão do dossier O&M; planeamento de revisão pós-ocupação.\n" +
      "Entregáveis: notas de encerramento, input de estado de remates, comentários ao dossier O&M, comentários de telas finais e agenda de revisão pós-ocupação.\n" +
      "Notas de coordenação: a PSA fecha temas de design e coordenação com empreiteiro e facilities do cliente antes da entrega final.",
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
      "Dear Client,\n\n" +
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
      "{project_name} is a workplace fit-out delivered under PSA's integrated design and " +
      "coordination model. Programme duration will be confirmed following phase validation " +
      "across briefing, design, tender and close-out.\n\n" +
      "Construction Assistance, where included, is structured as a monthly retainer aligned " +
      "with the confirmed construction programme, " +
      "ensuring design intent and coordination continuity from site mobilisation to handover.",
    bodyPt:
      "{project_name} é um fit-out de workplace entregue ao abrigo do modelo integrado de " +
      "projecto e coordenação da PSA. A duração do programa será confirmada após validação " +
      "das fases, cobrindo briefing, projecto, concurso e encerramento.\n\n" +
      "A Assistência à Obra, quando incluída, é estruturada como retainer mensal alinhado " +
      "com o programa de obra confirmado, " +
      "garantindo continuidade de design intent e coordenação desde a mobilização até à recepção.",
  },
  project_understanding: {
    titleEn: "Project Understanding",
    titlePt: "Compreensão do Projecto",
    bodyEn:
      "The client requires a workplace that supports focused work, collaboration and brand " +
      "presence, with the operational rigour expected of a large corporate occupier. We read " +
      "the project as a coordination exercise as much as a design one: spatial planning, " +
      "building services alignment, FF&E procurement and tenant-fit interface with the " +
      "base-building all need to land on the same date.",
    bodyPt:
      "O cliente pretende um workplace que suporte trabalho focado, colaboração e presença " +
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
      "throughout the confirmed programme rather than reserved to a " +
      "single technical phase.",
    bodyPt:
      "A nossa abordagem para {project_name} equilibra rigor funcional com contenção material. " +
      "Trabalhamos em ciclos curtos e iterativos com a equipa do cliente, validamos decisões " +
      "contra orçamento, programa e drivers operacionais, e cada marco é aprovado antes da " +
      "abertura da fase seguinte. A coordenação com consultores, senhorio e empreiteiro está " +
      "embebida ao longo do programa confirmado, não reservada a uma " +
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
      "{project_stage_fee_table}\n\n" +
      "Construction Assistance, where included, is structured as a monthly retainer aligned " +
      "with the confirmed construction programme.",
    bodyPt:
      "O quadro abaixo apresenta os honorários por fase de projecto (preço fixo) e o retainer " +
      "de assistência à obra. O detalhe completo e os marcos de pagamento constam do Anexo IV.\n\n" +
      "{project_stage_fee_table}\n\n" +
      "A Assistência à Obra, quando incluída, é estruturada como retainer mensal alinhado " +
      "com o programa de obra confirmado.",
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

/**
 * Build a delivery-mode variant by surgically overriding only the sections
 * whose tone changes with the engagement model. Phases and signature stay
 * the same; cover letter, executive summary and scope intro shift to reflect
 * the relationship with the local team / contractor.
 */
function withDeliveryModeOverrides(
  base: SectionTemplateMap,
  overrides: Partial<SectionTemplateMap>,
): SectionTemplateMap {
  return { ...base, ...overrides };
}

const WORKPLACE_LARGE_CONSULTANT_LED: SectionTemplateMap = withDeliveryModeOverrides(
  WORKPLACE_LARGE_PSA,
  {
    cover_letter: {
      titleEn: "Cover Letter",
      titlePt: "Carta de Apresentação",
      bodyEn:
        "Dear {client_name},\n\n" +
        "Thank you for the opportunity to support {project_name}. Under this engagement PSA " +
        "operates in an oversight and design-authority role, with a local lead consultant " +
        "carrying day-to-day delivery on the ground. Our scope safeguards design intent, " +
        "coordination quality and commercial alignment throughout the programme.\n\n" +
        "Each design stage is a fixed-fee deliverable; construction assistance runs as a lean " +
        "monthly retainer focused on design-intent oversight rather than full site presence. " +
        "Attachments I–VI carry the conditions, deliverables matrix, programme and fee schedule.",
      bodyPt:
        "Caro(a) {client_name},\n\n" +
        "Agradecemos a oportunidade de apoiar {project_name}. Neste modelo, a PSA assume um " +
        "papel de supervisão e autoridade de projecto, com um consultor local responsável pela " +
        "entrega diária no terreno. O nosso âmbito salvaguarda design intent, qualidade de " +
        "coordenação e alinhamento comercial ao longo do programa.\n\n" +
        "Cada fase de projecto é um entregável de honorários fixos; a assistência à obra " +
        "decorre como retainer mensal enxuto, focado na supervisão de design intent e não em " +
        "presença permanente em obra. Os Anexos I–VI reúnem condições, matriz de entregáveis, " +
        "programa e calendário de honorários.",
    },
    executive_summary: {
      titleEn: "Executive Summary",
      titlePt: "Sumário Executivo",
      bodyEn:
        "{project_name} is a workplace fit-out delivered under a PSA-oversight model with a " +
        "local lead consultant. Programme duration will be confirmed following phase validation.\n\n" +
        "Construction assistance, where included, is structured as a monthly oversight retainer, " +
        "covering design-intent reviews, sample approvals and milestone site visits. Routine " +
        "site supervision is carried by the local consultant.",
      bodyPt:
        "{project_name} é um fit-out para {client_name}, entregue ao abrigo de um modelo de " +
        "supervisão PSA com consultor local. Programa global: {overall_project_duration} dias " +
        "úteis.\n\n" +
        "A assistência à obra é um retainer de supervisão de {construction_duration} meses ao " +
        "valor de {construction_monthly_fee} por mês ({construction_monthly_hours} horas/mês), " +
        "cobrindo revisões de design intent, aprovações de amostras e visitas a obra em marcos. " +
        "A fiscalização de rotina é assegurada pelo consultor local.",
    },
  },
);

const WORKPLACE_LARGE_DESIGN_BUILD: SectionTemplateMap = withDeliveryModeOverrides(
  WORKPLACE_LARGE_PSA,
  {
    cover_letter: {
      titleEn: "Cover Letter",
      titlePt: "Carta de Apresentação",
      bodyEn:
        "Dear {client_name},\n\n" +
        "Thank you for the opportunity to propose on {project_name}. Under this design-build " +
        "engagement PSA carries the design responsibility while delivery is contracted through " +
        "a single-point design-build partner. Our role focuses on design authorship, technical " +
        "definition and design-intent enforcement at site stage.\n\n" +
        "Project stages are fixed-fee deliverables. Construction assistance runs as a monthly " +
        "retainer aligned with the design-build partner's site programme.",
      bodyPt:
        "Caro(a) {client_name},\n\n" +
        "Agradecemos a oportunidade de propor para {project_name}. Neste modelo design-build, " +
        "a PSA assume a responsabilidade de projecto enquanto a execução é contratada através " +
        "de um parceiro design-build com ponto único de responsabilidade. O nosso papel foca-se " +
        "em autoria de projecto, definição técnica e garantia de design intent em obra.\n\n" +
        "As fases de projecto são entregáveis de honorários fixos. A assistência à obra " +
        "decorre como retainer mensal alinhado com o programa de obra do parceiro design-build.",
    },
    scope_overview: {
      titleEn: "Scope Overview",
      titlePt: "Âmbito Geral",
      bodyEn:
        "Scope covers all design stages from briefing through tender support to the design-" +
        "build partner, and into construction-stage design-intent oversight and close-out. " +
        "Deliverables per phase are itemised in Attachment II; programme in Attachment III; " +
        "fees in Attachment IV.",
      bodyPt:
        "O âmbito cobre todas as fases de projecto, do briefing ao apoio ao concurso do " +
        "parceiro design-build, e à supervisão de design intent em obra e encerramento. Os " +
        "entregáveis por fase constam do Anexo II; o programa do Anexo III; e os honorários " +
        "do Anexo IV.",
    },
  },
);

export const SECTION_TEMPLATES: Record<string, SectionTemplateMap> = {
  [key("workplace", "large_corporate_fitout", "psa_led")]: WORKPLACE_LARGE_PSA,
  [key("workplace", "large_corporate_fitout", "consultant_led")]: WORKPLACE_LARGE_CONSULTANT_LED,
  [key("workplace", "large_corporate_fitout", "design_build")]: WORKPLACE_LARGE_DESIGN_BUILD,
  // Small fit-out reuses the large-corporate templates for V1; preset
  // refinement (shorter cover letter, reduced phase set) is tracked under
  // operational testing feedback rather than forking the template tree.
  [key("workplace", "small_fitout", "psa_led")]: WORKPLACE_LARGE_PSA,
  [key("workplace", "small_fitout", "consultant_led")]: WORKPLACE_LARGE_CONSULTANT_LED,
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
  // Phase templates are delivery-mode-agnostic for V1 workplace presets:
  // construction-as-retainer wording is intentionally consistent across
  // psa_led, consultant_led and design_build engagements. Per-mode phase
  // refinement is tracked under operational testing feedback.
  if (
    family === "workplace" &&
    (preset === "large_corporate_fitout" || preset === "small_fitout")
  ) {
    void deliveryMode;
    return WORKPLACE_PHASE_TEMPLATES[stageCode] ?? null;
  }
  return null;
}
