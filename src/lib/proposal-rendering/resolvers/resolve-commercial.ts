/**
 * Resolves dynamic commercial wording — milestone billing, recurring AT,
 * procurement wording and consultant subcontracting clarifications.
 *
 * These notes are additive: payment schedule generation and fee calculation
 * remain owned by the existing PSA Hub engines. This resolver only produces
 * the textual scaffolding that surrounds those numbers in the document.
 */
import type {
  RenderContext,
  ResolvedCommercialNote,
} from "../types";

interface CommercialRule {
  code: string;
  group: ResolvedCommercialNote["group"];
  titleEn: string;
  titlePt: string;
  bodyEn: string;
  bodyPt: string;
  applies: (ctx: RenderContext) => boolean;
}

const RULES: CommercialRule[] = [
  {
    code: "milestone_finite_phases",
    group: "milestone",
    titleEn: "Milestone Billing",
    titlePt: "Faturação por Milestone",
    bodyEn:
      "Finite design phases are invoiced as milestones on phase completion, in accordance with the payment schedule.",
    bodyPt:
      "As fases finitas de projeto são faturadas por milestone à conclusão de cada fase, de acordo com o plano de pagamentos.",
    applies: (ctx) =>
      ctx.enabledPhases.some((p) => p !== "P7" && p !== "P9"),
  },
  {
    code: "recurring_at",
    group: "recurring",
    titleEn: "Recurring AT",
    titlePt: "AT Recorrente",
    bodyEn:
      "Construction assistance (AT) is invoiced monthly during the agreed duration of the works.",
    bodyPt:
      "A Assistência Técnica é faturada mensalmente durante a duração acordada da obra.",
    applies: (ctx) => ctx.enabledPhases.includes("P7"),
  },
  {
    code: "at_with_standby",
    group: "recurring",
    titleEn: "Standby",
    titlePt: "Standby",
    bodyEn:
      "If the works are suspended, a standby rate applies for the duration of the suspension.",
    bodyPt:
      "Em caso de suspensão da obra, aplica-se uma taxa de standby durante o período de suspensão.",
    applies: (ctx) =>
      ctx.enabledPhases.includes("P7") &&
      ctx.flags["at_retainer_mode"] === "with_standby",
  },
  {
    code: "procurement_support",
    group: "procurement",
    titleEn: "Procurement Support",
    titlePt: "Apoio à Aquisição",
    bodyEn:
      "Procurement support is invoiced at the agreed lump sum on award of works.",
    bodyPt:
      "O apoio à aquisição é faturado pelo valor acordado à adjudicação da obra.",
    applies: (ctx) =>
      ctx.enabledPhases.includes("P6") &&
      (ctx.deliveryMode === "psa_assist_local" ||
        ctx.deliveryMode === "local_led_psa_oversight"),
  },
  {
    code: "procurement_led",
    group: "procurement",
    titleEn: "Procurement (PSA-led)",
    titlePt: "Aquisição (Liderada pela PSA)",
    bodyEn:
      "PSA-led procurement is invoiced as a milestone on contract award.",
    bodyPt:
      "A aquisição liderada pela PSA é faturada como milestone à adjudicação contratual.",
    applies: (ctx) =>
      ctx.enabledPhases.includes("P6") && ctx.deliveryMode === "psa_led",
  },
  {
    code: "subcontracting_psa",
    group: "subcontracting",
    titleEn: "Subcontracting",
    titlePt: "Subcontratação",
    bodyEn:
      "Where specialist consultants are subcontracted by PSA, their fees are passed through with the agreed management margin.",
    bodyPt:
      "Quando os consultores especialistas são subcontratados pela PSA, os respetivos honorários são repercutidos com a margem de gestão acordada.",
    applies: (ctx) => ctx.deliveryMode === "psa_led",
  },
  {
    code: "subcontracting_client",
    group: "subcontracting",
    titleEn: "Direct Contracting",
    titlePt: "Contratação Direta",
    bodyEn:
      "Specialist consultants are contracted directly by the client; PSA does not invoice their fees.",
    bodyPt:
      "Os consultores especialistas são contratados diretamente pelo cliente; a PSA não fatura os respetivos honorários.",
    applies: (ctx) =>
      ctx.deliveryMode === "psa_assist_local" ||
      ctx.deliveryMode === "local_led_psa_oversight",
  },
];

export function resolveCommercialNotes(ctx: RenderContext): ResolvedCommercialNote[] {
  if (!ctx.ontologyAvailable) return [];
  return RULES.filter((r) => r.applies(ctx)).map((r) => ({
    code: r.code,
    title: ctx.locale === "pt-PT" ? r.titlePt : r.titleEn,
    body: ctx.locale === "pt-PT" ? r.bodyPt : r.bodyEn,
    group: r.group,
  }));
}
