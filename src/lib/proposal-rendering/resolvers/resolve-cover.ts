/**
 * Cover page + cover letter resolvers. Deterministic templates with token
 * replacement — NO AI generation.
 */
import type {
  RenderContext,
  ResolvedCoverLetter,
  ResolvedCoverPage,
} from "../types";
import { applyTokens, applyTokensAll } from "../utils/tokens";
import { getCoverLetterTemplate } from "../templates/cover-letter";

const FAMILY_LABEL: Record<string, { en: string; pt: string }> = {
  architecture: { en: "Architecture", pt: "Arquitetura" },
  workplace: { en: "Workplace", pt: "Workplace" },
  hospitality: { en: "Hospitality", pt: "Hotelaria" },
  healthcare: { en: "Healthcare", pt: "Saúde" },
  interior_design: { en: "Interior Design", pt: "Design de Interiores" },
  strategy: { en: "Strategy", pt: "Estratégia" },
  retainer: { en: "Retainer", pt: "Avença" },
  competition: { en: "Competition", pt: "Concurso" },
  due_diligence: { en: "Due Diligence", pt: "Due Diligence" },
};

function familyLabel(ctx: RenderContext): string {
  if (!ctx.family) return ctx.locale === "pt-PT" ? "Projeto" : "Project";
  const entry = FAMILY_LABEL[ctx.family];
  if (!entry) return ctx.family;
  return ctx.locale === "pt-PT" ? entry.pt : entry.en;
}

export function resolveCoverPage(ctx: RenderContext): ResolvedCoverPage | undefined {
  if (!ctx.ontologyAvailable) return undefined;
  const t = ctx.tokens;
  const subtitle =
    ctx.locale === "pt-PT" ? "Proposta de Honorários" : "Fee Proposal";
  return {
    title: t.proposalTitle ?? t.projectName ?? "—",
    subtitle,
    client: t.clientName ?? t.accountName ?? "—",
    project: t.projectName ?? "—",
    isoDate: t.isoDate ?? new Date().toISOString().slice(0, 10),
    proposalCode: t.proposalCode ?? "—",
    familyLabel: familyLabel(ctx),
    firmName: t.firmName ?? "PSA",
  };
}

export function resolveCoverLetter(ctx: RenderContext): ResolvedCoverLetter | undefined {
  if (!ctx.ontologyAvailable) return undefined;
  const tpl = getCoverLetterTemplate(ctx.locale, ctx.proposalKind);
  const tokens = {
    ...ctx.tokens,
    family_label: familyLabel(ctx),
    project_name: ctx.tokens.projectName ?? "—",
    project_location: ctx.tokens.projectLocation ?? "—",
    contact_name:
      ctx.tokens.contactName ??
      ctx.tokens.clientName ??
      (ctx.locale === "pt-PT" ? "Senhor(a)" : "Sir/Madam"),
    firm_name: ctx.tokens.firmName ?? "PSA",
  } as Record<string, unknown>;

  return {
    greeting: applyTokens(tpl.greeting, tokens),
    paragraphs: applyTokensAll(tpl.paragraphs, tokens),
    closing: applyTokens(tpl.closing, tokens),
    signatory: applyTokens(tpl.signatory, tokens),
  };
}
