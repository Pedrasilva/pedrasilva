/**
 * Static, deterministic narrative for each canonical phase. Variants are
 * keyed by family / delivery mode and merged on top of the base narrative
 * by `resolvePhaseNarrative`. Wording stays terse and consultancy-grade.
 */
import type { PhaseCode, FamilyCode, DeliveryModeCode } from "@/lib/proposal-ontology/types";
import type { Locale } from "../types";

export interface PhaseNarrativeTemplate {
  purposeEn: string;
  purposePt: string;
  outputsEn: string[];
  outputsPt: string[];
  coordinationEn: string;
  coordinationPt: string;
  deliverablesEn: string[];
  deliverablesPt: string[];
  exclusionsEn: string[];
  exclusionsPt: string[];
  notesEn?: string[];
  notesPt?: string[];
  billingEn: string;
  billingPt: string;
}

export interface PhaseVariant {
  family?: FamilyCode;
  deliveryMode?: DeliveryModeCode;
  patch: Partial<PhaseNarrativeTemplate>;
}

export const PHASE_NARRATIVES: Record<PhaseCode, PhaseNarrativeTemplate> = {
  P0: {
    purposeEn: "Strategic framing of the opportunity and feasibility envelope.",
    purposePt: "Enquadramento estratégico da oportunidade e envelope de viabilidade.",
    outputsEn: ["Strategic brief", "Feasibility assessment"],
    outputsPt: ["Briefing estratégico", "Avaliação de viabilidade"],
    coordinationEn: "Direct interface with the client team and key stakeholders.",
    coordinationPt: "Interface direta com a equipa cliente e principais stakeholders.",
    deliverablesEn: ["Briefing report", "Constraints & opportunities map"],
    deliverablesPt: ["Relatório de briefing", "Mapa de constrangimentos e oportunidades"],
    exclusionsEn: ["Detailed design", "Cost estimates beyond order-of-magnitude"],
    exclusionsPt: ["Projeto detalhado", "Estimativas de custo além de ordem de grandeza"],
    billingEn: "Invoiced as a single milestone on phase completion.",
    billingPt: "Faturado num único milestone à conclusão da fase.",
  },
  P1: {
    purposeEn: "Pre-design analysis, site appraisal and programmatic alignment.",
    purposePt: "Análise prévia, apreciação do local e alinhamento programático.",
    outputsEn: ["Site analysis", "Programmatic study"],
    outputsPt: ["Análise do local", "Estudo programático"],
    coordinationEn: "Coordination with surveyors and any pre-existing studies.",
    coordinationPt: "Coordenação com topógrafos e estudos preexistentes.",
    deliverablesEn: ["Site report", "Programmatic matrix"],
    deliverablesPt: ["Relatório de local", "Matriz programática"],
    exclusionsEn: ["Geotechnical surveys", "Environmental impact assessments"],
    exclusionsPt: ["Estudos geotécnicos", "Avaliações de impacte ambiental"],
    billingEn: "Invoiced on phase completion.",
    billingPt: "Faturado à conclusão da fase.",
  },
  P2: {
    purposeEn: "Concept design — establishing the architectural direction.",
    purposePt: "Estudo prévio — definição da direção arquitetónica.",
    outputsEn: ["Concept design package", "Reference imagery"],
    outputsPt: ["Estudo prévio", "Imagens de referência"],
    coordinationEn: "Initial dialogue with specialist consultants.",
    coordinationPt: "Diálogo inicial com consultores especialistas.",
    deliverablesEn: ["Plans, sections, elevations at concept LOD", "Design narrative"],
    deliverablesPt: ["Plantas, cortes e alçados ao nível de estudo prévio", "Narrativa de projeto"],
    exclusionsEn: ["Cost plan", "Specialist engineering inputs"],
    exclusionsPt: ["Plano de custos", "Inputs de engenharias especialistas"],
    billingEn: "Invoiced on phase completion.",
    billingPt: "Faturado à conclusão da fase.",
  },
  P3: {
    purposeEn: "Developed design coordinated with specialist disciplines.",
    purposePt: "Anteprojeto coordenado com as disciplinas especialistas.",
    outputsEn: ["Developed architectural drawings", "Coordinated specialist inputs"],
    outputsPt: ["Desenhos de anteprojeto", "Inputs coordenados das especialidades"],
    coordinationEn: "Formal coordination with structural, MEP and other consultants.",
    coordinationPt: "Coordenação formal com estabilidade, MEP e demais especialistas.",
    deliverablesEn: ["Developed design package", "Outline specifications"],
    deliverablesPt: ["Anteprojeto", "Especificações preliminares"],
    exclusionsEn: ["Construction-level detailing"],
    exclusionsPt: ["Pormenorização ao nível de execução"],
    billingEn: "Invoiced on phase completion.",
    billingPt: "Faturado à conclusão da fase.",
  },
  P4: {
    purposeEn: "Licensing submission to the relevant authorities.",
    purposePt: "Submissão de licenciamento às entidades competentes.",
    outputsEn: ["Licensing dossier"],
    outputsPt: ["Processo de licenciamento"],
    coordinationEn: "Liaison with licensing entity and specialist consultants.",
    coordinationPt: "Articulação com a entidade licenciadora e consultores especialistas.",
    deliverablesEn: ["Statutory drawings", "Compliance memoranda"],
    deliverablesPt: ["Peças desenhadas para licenciamento", "Memorandos de conformidade"],
    exclusionsEn: ["Official fees and stamp duties"],
    exclusionsPt: ["Taxas oficiais e emolumentos"],
    notesEn: ["Approval timelines are controlled by the licensing authority."],
    notesPt: ["Os prazos de aprovação são controlados pela entidade licenciadora."],
    billingEn: "Invoiced on submission of the licensing dossier.",
    billingPt: "Faturado à submissão do processo de licenciamento.",
  },
  P5: {
    purposeEn: "Technical / execution design ready for construction tender.",
    purposePt: "Projeto de execução pronto para concurso de obra.",
    outputsEn: ["Execution drawings", "Technical specifications"],
    outputsPt: ["Peças desenhadas de execução", "Especificações técnicas"],
    coordinationEn: "Full coordination with specialist consultants and BoQ teams.",
    coordinationPt: "Coordenação plena com consultores especialistas e equipas de mapa de quantidades.",
    deliverablesEn: ["Execution package", "Specifications", "Bill of quantities (architecture)"],
    deliverablesPt: ["Projeto de execução", "Cadernos de encargos", "Mapa de quantidades (arquitetura)"],
    exclusionsEn: ["Specialist BoQs (engineering)"],
    exclusionsPt: ["Mapas de quantidades das especialidades"],
    billingEn: "Invoiced on phase completion.",
    billingPt: "Faturado à conclusão da fase.",
  },
  P6: {
    purposeEn: "Tender support and contractor selection.",
    purposePt: "Apoio ao concurso e seleção do empreiteiro.",
    outputsEn: ["Tender documentation", "Comparative analysis"],
    outputsPt: ["Documentação de concurso", "Análise comparativa"],
    coordinationEn: "Coordination with the client's procurement team.",
    coordinationPt: "Coordenação com a equipa de aquisição do cliente.",
    deliverablesEn: ["Tender pack", "Clarification responses", "Award recommendation"],
    deliverablesPt: ["Caderno de concurso", "Respostas a esclarecimentos", "Recomendação de adjudicação"],
    exclusionsEn: ["Contract drafting"],
    exclusionsPt: ["Redação contratual"],
    billingEn: "Invoiced on award of works.",
    billingPt: "Faturado à adjudicação da obra.",
  },
  P7: {
    purposeEn: "Construction assistance (AT) — site monitoring and consultant coordination.",
    purposePt: "Assistência Técnica (AT) — acompanhamento de obra e coordenação de consultores.",
    outputsEn: ["Site visit reports", "Coordination minutes", "Change instructions"],
    outputsPt: ["Relatórios de visita", "Atas de coordenação", "Ordens de alteração"],
    coordinationEn: "Continuous coordination with contractor, fiscalização and specialists.",
    coordinationPt: "Coordenação contínua com empreiteiro, fiscalização e especialistas.",
    deliverablesEn: ["Periodic AT reports"],
    deliverablesPt: ["Relatórios periódicos de AT"],
    exclusionsEn: ["Site supervision / direção de obra", "Health & safety coordination"],
    exclusionsPt: ["Direção de obra", "Coordenação de segurança e saúde"],
    billingEn: "Invoiced monthly during the agreed AT period.",
    billingPt: "Faturado mensalmente durante o período de AT acordado.",
  },
  P8: {
    purposeEn: "Project close-out and as-built coordination.",
    purposePt: "Encerramento do projeto e coordenação de telas finais.",
    outputsEn: ["Close-out report", "Coordinated as-built record"],
    outputsPt: ["Relatório de encerramento", "Telas finais coordenadas"],
    coordinationEn: "Coordination with contractor and specialist consultants.",
    coordinationPt: "Coordenação com empreiteiro e consultores especialistas.",
    deliverablesEn: ["Close-out dossier"],
    deliverablesPt: ["Dossier de encerramento"],
    exclusionsEn: ["Production of as-built drawings (contractor responsibility)"],
    exclusionsPt: ["Produção de telas finais (responsabilidade do empreiteiro)"],
    billingEn: "Invoiced on phase completion.",
    billingPt: "Faturado à conclusão da fase.",
  },
  P8_5: {
    purposeEn: "Post-occupancy evaluation and snagging review.",
    purposePt: "Avaliação pós-ocupação e revisão de defeitos.",
    outputsEn: ["POE report"],
    outputsPt: ["Relatório de avaliação pós-ocupação"],
    coordinationEn: "Coordination with facilities and operations.",
    coordinationPt: "Coordenação com facilities e operações.",
    deliverablesEn: ["Snagging list", "POE summary"],
    deliverablesPt: ["Lista de defeitos", "Resumo da avaliação pós-ocupação"],
    exclusionsEn: ["Remediation works"],
    exclusionsPt: ["Trabalhos de correção"],
    billingEn: "Invoiced on phase completion.",
    billingPt: "Faturado à conclusão da fase.",
  },
  P9: {
    purposeEn: "FF&E — concept, specification and procurement support.",
    purposePt: "FF&E — conceito, especificação e apoio à aquisição.",
    outputsEn: ["FF&E schedule", "Specification sheets"],
    outputsPt: ["Mapa de FF&E", "Fichas de especificação"],
    coordinationEn: "Coordination with suppliers and procurement.",
    coordinationPt: "Coordenação com fornecedores e aquisição.",
    deliverablesEn: ["FF&E pack"],
    deliverablesPt: ["Pacote FF&E"],
    exclusionsEn: ["Purchase and installation"],
    exclusionsPt: ["Compra e instalação"],
    notesEn: ["FF&E runs in parallel with the architectural phases."],
    notesPt: ["O FF&E corre em paralelo com as fases de arquitetura."],
    billingEn: "Invoiced on completion of the FF&E workstream.",
    billingPt: "Faturado à conclusão da linha de FF&E.",
  },
};

export const PHASE_VARIANTS: PhaseVariant[] = [
  {
    family: "workplace",
    patch: {},
  },
  {
    family: "hospitality",
    patch: {
      notesEn: ["Operator and brand standards are coordinated throughout."],
      notesPt: ["Os padrões do operador e da marca são coordenados de forma contínua."],
    },
  },
  {
    deliveryMode: "local_led_psa_oversight",
    patch: {
      coordinationEn: "PSA oversees and supports the local consultant.",
      coordinationPt: "A PSA acompanha e apoia o consultor local.",
    },
  },
];

export function pickPhaseField<K extends keyof PhaseNarrativeTemplate>(
  base: PhaseNarrativeTemplate,
  k: K,
  locale: Locale,
): PhaseNarrativeTemplate[K] {
  void locale;
  return base[k];
}
