/**
 * Clause registry. Clauses are conditionally injected by `resolveClauses()`
 * and live inside the resolved view; the user may always edit, reorder or
 * remove a clause once it lands in the document.
 *
 * Wording is intentionally professional, terse and jurisdiction-aware.
 */
import type { ClauseRegistryEntry } from "../utils/applicability";

export const CLAUSE_REGISTRY: ClauseRegistryEntry[] = [
  // ---------------- BIM ----------------
  {
    code: "bim_methodology",
    titleEn: "BIM Methodology",
    titlePt: "Metodologia BIM",
    bodyEn:
      "The project will be developed in a federated BIM environment, with discipline-specific models coordinated against an architectural reference model. LOD/LOI shall be agreed at the start of each phase.",
    bodyPt:
      "O projeto será desenvolvido em ambiente BIM federado, com modelos por especialidade coordenados contra o modelo arquitetónico de referência. LOD/LOI serão acordados no início de cada fase.",
    preferredSection: "methodology",
    tone: "default",
    applicability: { bimEnabled: true },
    reason: "flag:bim_enabled",
  },

  // ---------------- AT / retainer ----------------
  {
    code: "at_retainer",
    titleEn: "Construction Assistance (AT)",
    titlePt: "Assistência Técnica (AT)",
    bodyEn:
      "Assistance during construction (AT) will be invoiced on a monthly recurring basis for the agreed duration of the works.",
    bodyPt:
      "A Assistência Técnica (AT) à obra será faturada mensalmente, em regime recorrente, durante o período acordado de execução.",
    preferredSection: "commercial_terms",
    tone: "default",
    applicability: { anyPhases: ["P7"] },
    reason: "phase:P7",
  },
  {
    code: "at_standby",
    titleEn: "Standby Provision",
    titlePt: "Período de Standby",
    bodyEn:
      "Periods during which the works are suspended will be invoiced at the agreed standby rate.",
    bodyPt:
      "Períodos em que a obra esteja suspensa serão faturados à taxa de standby acordada.",
    preferredSection: "commercial_terms",
    tone: "default",
    applicability: { anyPhases: ["P7"], flagsEq: { at_retainer_mode: "with_standby" } },
    reason: "at_retainer_mode:with_standby",
  },
  {
    code: "at_demolition_exclusion",
    titleEn: "Demolition Phase",
    titlePt: "Fase de Demolição",
    bodyEn:
      "AT does not include presence during demolition works unless explicitly requested in writing.",
    bodyPt:
      "A AT não contempla presença durante trabalhos de demolição, salvo solicitação expressa por escrito.",
    preferredSection: "exclusions",
    tone: "exclusion",
    applicability: { anyPhases: ["P7"] },
    reason: "at_default_exclusion",
  },

  // ---------------- Licensing / jurisdictional ----------------
  {
    code: "licensing_disclaimer",
    titleEn: "Licensing",
    titlePt: "Licenciamento",
    bodyEn:
      "Approval timelines depend on the licensing authority and are outside the consultant's control. Official fees and stamp duties are charged at cost to the client.",
    bodyPt:
      "Os prazos de aprovação dependem da entidade licenciadora e estão fora do controlo do consultor. Taxas oficiais e emolumentos são debitados ao custo ao cliente.",
    preferredSection: "assumptions",
    tone: "limitation",
    applicability: { anyPhases: ["P4"] },
    reason: "phase:P4_licensing",
  },

  // ---------------- Delivery mode ----------------
  {
    code: "local_consultant_disclaimer",
    titleEn: "Local Consultant Coordination",
    titlePt: "Coordenação com Consultor Local",
    bodyEn:
      "PSA will oversee and support the local consultant, who remains contractually responsible for jurisdictional compliance and statutory submissions.",
    bodyPt:
      "A PSA acompanha e apoia o consultor local, que mantém a responsabilidade contratual pelo cumprimento jurisdicional e submissões legais.",
    preferredSection: "scope_overview",
    tone: "limitation",
    applicability: { deliveryModes: ["local_led_psa_oversight"] },
    reason: "delivery_mode:local_led_psa_oversight",
  },
  {
    code: "consultant_coordination_psa_led",
    titleEn: "Consultant Coordination",
    titlePt: "Coordenação de Especialistas",
    bodyEn:
      "PSA leads coordination of specialist consultants engaged for the project. Subcontracting arrangements are agreed case-by-case.",
    bodyPt:
      "A PSA lidera a coordenação dos consultores especialistas envolvidos. Os acordos de subcontratação são definidos caso a caso.",
    preferredSection: "methodology",
    tone: "default",
    applicability: { deliveryModes: ["psa_led"] },
    reason: "delivery_mode:psa_led",
  },
  {
    code: "consultant_coordination_client_led",
    titleEn: "Consultant Coordination",
    titlePt: "Coordenação de Especialistas",
    bodyEn:
      "Specialist consultants are contracted directly by the client; PSA coordinates inputs but holds no contractual relationship with them.",
    bodyPt:
      "Os consultores especialistas são contratados diretamente pelo cliente; a PSA coordena os inputs mas não mantém relação contratual com eles.",
    preferredSection: "methodology",
    tone: "limitation",
    applicability: { deliveryModes: ["psa_assist_local"] },
    reason: "delivery_mode:psa_assist_local",
  },

  // ---------------- FF&E ----------------
  {
    code: "ffe_exclusion",
    titleEn: "FF&E",
    titlePt: "FF&E",
    bodyEn:
      "FF&E selection, procurement and installation are excluded from this proposal unless an FF&E add-on is engaged separately.",
    bodyPt:
      "A seleção, aquisição e instalação de FF&E ficam excluídas desta proposta, salvo contratação separada do módulo FF&E.",
    preferredSection: "exclusions",
    tone: "exclusion",
    applicability: { predicate: (ctx) => !ctx.addonCodes.includes("ffe") },
    reason: "default_ffe_exclusion",
  },
  {
    code: "ffe_inclusion",
    titleEn: "FF&E Track",
    titlePt: "Linha de FF&E",
    bodyEn:
      "An FF&E workstream runs in parallel with the architectural phases and covers concept, specification and procurement support.",
    bodyPt:
      "Uma linha de FF&E corre em paralelo com as fases de arquitetura e abrange conceito, especificação e apoio à aquisição.",
    preferredSection: "scope_overview",
    tone: "default",
    applicability: { addons: ["ffe"] },
    reason: "addon:ffe",
  },

  // ---------------- Procurement ----------------
  {
    code: "procurement_support",
    titleEn: "Procurement Support",
    titlePt: "Apoio à Aquisição",
    bodyEn:
      "Procurement is led by the client; PSA supports tender preparation, contractor pre-qualification and bid review.",
    bodyPt:
      "A aquisição é liderada pelo cliente; a PSA apoia a preparação do concurso, a pré-qualificação de empreiteiros e a análise de propostas.",
    preferredSection: "scope_overview",
    tone: "default",
    applicability: { anyPhases: ["P6"], deliveryModes: ["psa_assist_local", "local_led_psa_oversight"] },
    reason: "procurement_support",
  },
  {
    code: "procurement_led",
    titleEn: "Procurement (PSA-led)",
    titlePt: "Aquisição (Liderada pela PSA)",
    bodyEn:
      "PSA leads the procurement process: tender documentation, contractor selection and contract award support.",
    bodyPt:
      "A PSA lidera o processo de aquisição: documentação de concurso, seleção do empreiteiro e apoio à adjudicação.",
    preferredSection: "scope_overview",
    tone: "default",
    applicability: { anyPhases: ["P6"], deliveryModes: ["psa_led"] },
    reason: "procurement_led",
  },

  // ---------------- Travel ----------------
  {
    code: "travel_reimbursement",
    titleEn: "Travel & Expenses",
    titlePt: "Deslocações e Despesas",
    bodyEn:
      "Travel and out-of-pocket expenses are invoiced at cost against supporting documentation.",
    bodyPt:
      "Deslocações e despesas associadas são faturadas ao custo, mediante apresentação de comprovativos.",
    preferredSection: "commercial_terms",
    tone: "default",
    reason: "always",
  },

  // ---------------- Shell/core (hospitality) ----------------
  {
    code: "shell_core_limitation",
    titleEn: "Shell & Core Scope",
    titlePt: "Âmbito Shell & Core",
    bodyEn:
      "This proposal covers shell & core architecture only. Interior fit-out is excluded and may be quoted separately.",
    bodyPt:
      "Esta proposta cobre apenas arquitetura shell & core. O acabamento interior fica excluído e poderá ser orçamentado em separado.",
    preferredSection: "exclusions",
    tone: "limitation",
    applicability: { flagsEq: { scope_of_architecture: "shell_core" } },
    reason: "scope_of_architecture:shell_core",
  },

  // ---------------- Public tender ----------------
  {
    code: "public_tender_compliance",
    titleEn: "Public Procurement Compliance",
    titlePt: "Conformidade com o CCP",
    bodyEn:
      "This proposal is prepared in accordance with the Portuguese Public Procurement Code (CCP) and uses Portaria n.º 255/2017 nomenclature for project phases.",
    bodyPt:
      "Esta proposta é elaborada em conformidade com o Código dos Contratos Públicos (CCP) e utiliza a nomenclatura da Portaria n.º 255/2017 para as fases de projeto.",
    preferredSection: "assumptions",
    tone: "obligation",
    applicability: { publicTenderMode: true },
    reason: "public_tender_mode",
  },

  // ---------------- Close-out / telas finais ----------------
  {
    code: "close_out_responsibilities",
    titleEn: "Project Close-out",
    titlePt: "Encerramento do Projeto",
    bodyEn:
      "Close-out includes coordination of as-built documentation collected from contractors and consultants and submission to the relevant entities.",
    bodyPt:
      "O encerramento inclui a coordenação das telas finais recolhidas junto de empreiteiros e consultores e a respetiva submissão às entidades.",
    preferredSection: "scope_overview",
    tone: "default",
    applicability: { anyPhases: ["P8"] },
    reason: "phase:P8",
  },
  {
    code: "telas_finais_responsibility",
    titleEn: "As-built Documentation",
    titlePt: "Telas Finais",
    bodyEn:
      "Production of as-built drawings is the responsibility of the contractor; PSA coordinates and reviews the deliverables.",
    bodyPt:
      "A produção de telas finais é da responsabilidade do empreiteiro; a PSA coordena e revê as entregas.",
    preferredSection: "exclusions",
    tone: "limitation",
    applicability: { anyPhases: ["P8"] },
    reason: "phase:P8_telas_finais",
  },

  // ---------------- Specialist exclusions ----------------
  {
    code: "specialist_exclusions",
    titleEn: "Specialist Disciplines",
    titlePt: "Especialidades",
    bodyEn:
      "Structural, MEP, acoustics, fire safety and other specialist disciplines are excluded from PSA's scope and must be procured separately.",
    bodyPt:
      "Estabilidade, MEP, acústica, segurança contra incêndio e demais especialidades ficam excluídas do âmbito da PSA e devem ser contratadas separadamente.",
    preferredSection: "exclusions",
    tone: "exclusion",
    applicability: { deliveryModes: ["psa_assist_local", "local_led_psa_oversight"] },
    reason: "specialist_exclusions",
  },

  // ---------------- Workplace ----------------
  {
    code: "workplace_test_fit_methodology",
    titleEn: "Test-fit Methodology",
    titlePt: "Metodologia de Test-fit",
    bodyEn:
      "Test-fits are produced iteratively to validate occupancy density, adjacencies and circulation against the brief.",
    bodyPt:
      "Os test-fits são produzidos iterativamente para validar densidade, adjacências e circulação face ao programa.",
    preferredSection: "methodology",
    tone: "default",
    applicability: { families: ["workplace"] },
    reason: "family:workplace",
  },
  {
    code: "workplace_stakeholder_workshops",
    titleEn: "Stakeholder Workshops",
    titlePt: "Workshops com Stakeholders",
    bodyEn:
      "Stakeholder workshops are scheduled during P1 and P2 to capture functional, cultural and brand requirements.",
    bodyPt:
      "Os workshops com stakeholders decorrem durante P1 e P2 para captar requisitos funcionais, culturais e de marca.",
    preferredSection: "methodology",
    tone: "default",
    applicability: { families: ["workplace"], anyPhases: ["P1", "P2"] },
    reason: "family:workplace+phase:P1/P2",
  },

  // ---------------- Hospitality specialist coordination ----------------
  {
    code: "hospitality_specialist_coordination",
    titleEn: "Operator & Specialist Coordination",
    titlePt: "Coordenação com Operador e Especialistas",
    bodyEn:
      "Coordination with the operator and brand-mandated specialists (kitchen, spa, AV, lighting) is included; their fees are not.",
    bodyPt:
      "A coordenação com o operador e especialistas exigidos pela marca (cozinha, spa, AV, iluminação) está incluída; os respetivos honorários não.",
    preferredSection: "scope_overview",
    tone: "default",
    applicability: { families: ["hospitality"] },
    reason: "family:hospitality",
  },

  // ---------------- Healthcare ----------------
  {
    code: "healthcare_signage_wayfinding",
    titleEn: "Signage & Wayfinding",
    titlePt: "Sinalética e Wayfinding",
    bodyEn:
      "Signage and wayfinding strategy is included as a coordinated workstream; fabrication and installation are excluded.",
    bodyPt:
      "A estratégia de sinalética e wayfinding está incluída como linha coordenada; produção e instalação ficam excluídas.",
    preferredSection: "scope_overview",
    tone: "default",
    applicability: { families: ["healthcare"] },
    reason: "family:healthcare",
  },
];
