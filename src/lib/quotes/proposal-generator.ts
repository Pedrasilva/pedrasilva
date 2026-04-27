/**
 * Proposal document generator.
 *
 * Pure (isomorphic) module that, given quote data + the master block library,
 * produces a quote_proposal_documents snapshot and the ordered list of
 * quote_proposal_document_blocks to insert.
 *
 * No DB calls live in this file — callers (server fn or hook) load data and
 * pass it in, then persist the returned `documentDraft` + `blockDrafts`.
 *
 * Two-layer rule: this module only READS proposal_blocks (master library)
 * and produces COPIES for quote_proposal_document_blocks. It never edits
 * the master library.
 */
import { rollupQuote, quoteAllocationLine } from "./financial-rollups";
import type { QuoteAllocationWithResource } from "./use-quote-allocations";
import type { QuoteExternalServiceWithSupplier } from "./use-quote-external-services";
import type { QuoteStage, QuotePaymentScheduleItem } from "./types";

// ───────────────────────────── Types ─────────────────────────────

export type ProposalBlockType =
  | "editable_text"
  | "generated_section"
  | "legal_reference";

export type ProposalBlockVisibility = "client" | "internal" | "both";

export interface MasterBlock {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  language: string;
  block_type: ProposalBlockType;
  visibility: ProposalBlockVisibility;
  default_content: string;
  variables: Record<string, unknown> | null;
  sort_order: number;
}

export interface MasterCategory {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export interface QuoteContext {
  quote: {
    id: string;
    titulo: string;
    proposal_description: string | null;
    pricing_multiplier: number;
    data_proposta: string | null;
  };
  company: { id: string; nome: string } | null;
  contact: { id: string; primeiro_nome: string; apelido: string | null } | null;
  opportunity: { id: string; project_brief: string | null } | null;
  stages: Array<Pick<QuoteStage, "id" | "name" | "start_date" | "end_date" | "sort_order">>;
  allocations: QuoteAllocationWithResource[];
  externalServices: QuoteExternalServiceWithSupplier[];
  paymentSchedule: QuotePaymentScheduleItem[];
  invoiceSettings: {
    payment_terms_days: number;
    company_name: string | null;
    vat_rate: number;
  } | null;
}

export interface GeneratedSnapshot {
  /** Which block-set was used to generate this document. Persisted so that
   *  "Regenerate draft" can preserve the user's original choice without
   *  requiring a schema column. */
  proposal_kind?: ProposalKind;
  /** Resolved variable map applied to all editable_text blocks. */
  variables: Record<string, string>;
  /** Computed quote view used by generated_section blocks. */
  computed: {
    totalFee: number;
    internalFee: number;
    externalFee: number;
    pricingMultiplier: number;
    currency: string;
    stages: Array<{ id: string; name: string; start_date: string; end_date: string }>;
    timeline: { start_date: string | null; end_date: string | null };
    rolesByLabel: Array<{ role: string; hours: number }>;
    externalServices: Array<{
      description: string;
      supplier: string | null;
      sale_price: number;
      quantity: number;
      total: number;
    }>;
    fees: { internal: number; external: number; total: number };
    paymentSchedule: Array<{
      label: string;
      amount: number;
      expected_invoice_date: string | null;
    }>;
    acceptance: {
      client_name: string;
      proposal_title: string;
      total_fee: number;
    };
  };
}

export interface DocumentDraft {
  quote_id: string;
  title: string;
  language: string;
  status: "draft";
  revision_number: number;
  snapshot_json: GeneratedSnapshot;
  generated_at: string;
}

export interface BlockDraft {
  proposal_block_id: string | null;
  block_title: string;
  block_type: ProposalBlockType;
  content: string;
  generated_content: Record<string, unknown> | null;
  sort_order: number;
  is_included: boolean;
  is_locked: boolean;
}

export type ProposalKind =
  | "fixed_project"
  | "phased_consultancy"
  | "psa_interior_fitout"
  | "construction_retainer"
  | "consultancy_hours_package";

/**
 * Map a quote_type (commercial classification stored on fee_proposals) to
 * the default ProposalKind used by the generator. `standard_project` keeps
 * the existing legacy default ("fixed_project"); the two time-based types
 * route to their dedicated block sets.
 */
export function quoteTypeToProposalKind(
  quoteType: string | null | undefined,
): ProposalKind {
  switch (quoteType) {
    case "construction_retainer":
      return "construction_retainer";
    case "consultancy_hours_package":
      return "consultancy_hours_package";
    case "standard_project":
    default:
      return "fixed_project";
  }
}

export interface ConsultancyConfig {
  hourly_rate?: number | null;
  hours_block?: number | null;
  minimum_commitment_hours?: number | null;
  /** Optional override list for phases. */
  phases?: Array<{ label: string; estimated_hours?: number | null }>;
}

export interface GenerateInput {
  ctx: QuoteContext;
  masterBlocks: MasterBlock[];
  masterCategories: MasterCategory[];
  language?: string;
  /** Explicit slug list (in order). When omitted, default set is used. */
  slugs?: string[];
  /** Slugs to exclude from the default set. */
  excludeSlugs?: string[];
  /** Override revision number (defaults to 1 — caller can bump for revisions). */
  revisionNumber?: number;
  /** Currency code for variable substitution (defaults EUR). */
  currency?: string;
  /** Default validity period in days when block uses {{validity_days}}. */
  validityDays?: number;
  /** Which proposal block-set to use when no explicit `slugs` are provided. */
  proposalKind?: ProposalKind;
  /** Optional consultancy-specific config (used by phased_consultancy generated blocks). */
  consultancy?: ConsultancyConfig;
}

export interface GenerateOutput {
  documentDraft: DocumentDraft;
  blockDrafts: BlockDraft[];
  /** Slugs from the chosen set that were NOT found in the library. */
  missingSlugs: string[];
}

// ───────────────────────── Default block set ─────────────────────────

/**
 * Default ordered slug list when caller does not supply one.
 * Generated sections are interleaved at semantically correct positions.
 */
export const DEFAULT_PROPOSAL_BLOCK_SLUGS: readonly string[] = [
  // Cover
  "intro-standard",
  // About
  "about-psa-standard",
  // Project
  "project-desc-generic",
  // Scope
  "scope-generic",
  // Stages (auto)
  "generated-stage-summary",
  // Timeline (auto)
  "generated-timeline",
  // Team breakdown by role (auto, client-safe)
  "generated-role-summary",
  // External
  "consultants-note",
  "generated-external-services",
  // Fee
  "fee-explanation",
  "generated-fee-summary",
  // Payment
  "payment-intro",
  "payment-stage-based",
  "generated-payment-schedule",
  // Additional
  "additional-services-standard",
  // General
  "assumptions-standard",
  // Exclusions
  "exclusions-standard",
  // Validity & acceptance
  "validity-period",
  "acceptance-wording",
  "generated-acceptance-block",
] as const;

/**
 * Default ordered slug list for time-based phased consultancy proposals.
 * Used when generator is called with proposalKind === "phased_consultancy".
 */
export const DEFAULT_CONSULTANCY_BLOCK_SLUGS: readonly string[] = [
  "intro-consultancy-due-diligence",
  "consultancy-scope-overview",
  "consultancy-phase-1-feasibility",
  "consultancy-phase-2-detailed",
  "consultancy-phase-3-pip",
  "generated-consultancy-phases",
  "consultancy-methodology-iterative",
  "consultancy-fee-structure-time-based",
  "generated-time-fee-consultancy",
  "consultancy-exclusions-standard",
  "consultancy-validity-next-steps",
] as const;

/**
 * Ordered slug list for the "Interior Fit-Out" preset, mirroring the
 * structure of a full architectural fee proposal: cover/intro, project
 * areas, scope (interior + furniture + signage), local-authority
 * exclusions, MEP/lighting note, sustainability note, base information,
 * stages intro, auto-generated stage/timeline/role tables, fee intro
 * with auto fee summary, monthly payment cycle with auto schedule,
 * timelines & deadlines, additional services, travelling, exclusions,
 * validity, auto acceptance block, closing & signature.
 *
 * Used when generator is called with proposalKind === "psa_interior_fitout".
 */
export const PSA_INTERIOR_BLOCK_SLUGS: readonly string[] = [
  // Cover
  "psa-intro-interior-fitout",
  // About
  "about-psa-standard",
  // §1 Project description / scope
  "psa-project-areas",
  "psa-scope-interior-design",
  "psa-scope-exclusions-local",
  "psa-mep-lighting-note",
  "psa-leed-breeam-note",
  // §2 Base information
  "psa-base-information",
  // §3 Stages
  "psa-stages-intro",
  "generated-stage-summary",
  "generated-timeline",
  "generated-role-summary",
  // §4 Fee proposal
  "psa-fee-intro-inflation",
  "generated-fee-summary",
  // §5 Payment terms & schedule
  "psa-payment-monthly-cycle",
  "generated-payment-schedule",
  // §6 Timelines and deadlines
  "psa-timelines-deadlines",
  // §7 Additional services
  "psa-additional-services-interior",
  // §8 Travelling
  "psa-travelling",
  // §9 Exclusions
  "psa-exclusions-interior",
  // §10 Validity & acceptance
  "psa-validity-30-days",
  "generated-acceptance-block",
  "psa-closing-signature",
] as const;

/**
 * Ordered slug list for the **Construction Retainer** quote type.
 * Time-based proposal: no stages/Gantt sections — just an intro,
 * about, scope, generated team-by-role table (still meaningful since
 * monthly hours can be allocated by role), fees, monthly payment cycle,
 * exclusions, validity, and acceptance.
 *
 * Used when generator is called with proposalKind === "construction_retainer".
 */
export const RETAINER_BLOCK_SLUGS: readonly string[] = [
  "retainer-intro",
  "about-psa-standard",
  "retainer-scope",
  "generated-role-summary",
  "retainer-fee-monthly",
  "generated-fee-summary",
  "retainer-payment-cycle",
  "generated-payment-schedule",
  "retainer-exclusions",
  "validity-period",
  "generated-acceptance-block",
] as const;

/**
 * Ordered slug list for the **Consultancy Hours Package** quote type.
 * Reuses the existing time-based consultancy block library plus the
 * generated time/fee summary so the client sees hourly rate, hours
 * block and minimum commitment up front.
 *
 * Used when generator is called with proposalKind === "consultancy_hours_package".
 */
export const CONSULTANCY_HOURS_PACKAGE_BLOCK_SLUGS: readonly string[] = [
  "intro-consultancy-due-diligence",
  "about-psa-standard",
  "consultancy-scope-overview",
  "consultancy-methodology-iterative",
  "consultancy-fee-structure-time-based",
  "generated-time-fee-consultancy",
  "consultancy-exclusions-standard",
  "consultancy-validity-next-steps",
  "generated-acceptance-block",
] as const;

// ────────────────────── Variable substitution ──────────────────────

const CURRENCY_FORMATTERS: Record<string, Intl.NumberFormat> = {};
function formatMoney(value: number, currency: string, language: string): string {
  const key = `${language}|${currency}`;
  if (!CURRENCY_FORMATTERS[key]) {
    try {
      CURRENCY_FORMATTERS[key] = new Intl.NumberFormat(language, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      CURRENCY_FORMATTERS[key] = new Intl.NumberFormat("en", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      });
    }
  }
  return CURRENCY_FORMATTERS[key].format(value);
}

function buildVariables(
  ctx: QuoteContext,
  totalFee: number,
  currency: string,
  language: string,
  validityDays: number,
  consultancy?: ConsultancyConfig,
): Record<string, string> {
  const clientName = ctx.company?.nome?.trim() || "";
  const contactName = ctx.contact
    ? `${ctx.contact.primeiro_nome} ${ctx.contact.apelido ?? ""}`.trim()
    : "";
  const fmtNum = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  return {
    client_name: clientName || contactName || "Client",
    project_name: ctx.quote.titulo || "",
    project_location: "", // not currently captured; left blank
    project_brief:
      ctx.opportunity?.project_brief?.trim() ||
      ctx.quote.proposal_description?.trim() ||
      "",
    total_fee: formatMoney(totalFee, currency, language),
    validity_days: String(validityDays),
    payment_terms_days: String(ctx.invoiceSettings?.payment_terms_days ?? 30),
    currency,
    project_type: "",
    property_type: "",
    hourly_rate: fmtNum(consultancy?.hourly_rate),
    hours_block: fmtNum(consultancy?.hours_block),
    minimum_commitment_hours: fmtNum(consultancy?.minimum_commitment_hours),
    // PSA Interior Fit-Out preset variables — all blank by default; the
    // existing cleanupEmptyPhrases() sanitiser drops any sentence that
    // collapses around an empty value so client-facing copy stays clean.
    project_areas: "",
    stage_count: String(ctx.stages.length),
    firm_partner_name: "",
    firm_partner_title: "",
  };
}

const VAR_TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Replace `{{var}}` tokens. A variable that is *defined* in the map is
 * always substituted, even when its value is the empty string — leaving
 * `{{token}}` in client-facing copy is never acceptable. Only truly
 * unknown variables fall through unchanged so missing keys are noticed
 * during template authoring.
 *
 * After substitution, awkward phrases that depend on a now-empty
 * variable (e.g. ", located in ") are cleaned up so the surrounding
 * sentence still reads naturally.
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  const replaced = template.replace(VAR_TOKEN_RE, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : match;
  });
  return cleanupEmptyPhrases(replaced);
}

/**
 * Remove sentence fragments that become awkward when an injected
 * variable resolves to an empty string. Safe to apply to both freshly
 * substituted text and previously generated content stored in the DB.
 */
export function cleanupEmptyPhrases(text: string): string {
  if (!text) return text;
  let out = text;
  // Remove whole lines that have collapsed into an empty location predicate,
  // e.g. "Speedy Gonzalez is ." or "**Speedy Gonzalez** is located in .".
  out = out
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/\s{2,}/g, " ").trim();
      if (/^is\s+(?:located\s+in\s*)?[.,;:!?]$/i.test(trimmed)) return "";
      if (/^\S[\s\S]*?\s+is\s+(?:located\s+in\s*)?[.,;:!?]$/i.test(trimmed)) {
        return "";
      }
      return line;
    })
    .join("\n");
  // Composite empty-predicate fragments — order matters: longest/most specific first.
  // Drop "is located in " when followed by punctuation/EOL (variable was empty).
  out = out.replace(/\bis\s+located\s+in\s*(?=[.,;:!?\n)]|$)/gi, "");
  // Drop ", located in " when followed by punctuation/EOL.
  out = out.replace(/,\s*located in\s*(?=[.,;:!?\n)]|$)/gi, "");
  // Drop bare "located in " when followed by punctuation/EOL.
  out = out.replace(/\blocated in\s*(?=[.,;:!?\n)]|$)/gi, "");
  // " in " immediately followed by punctuation (e.g. "a residential project in .")
  out = out.replace(/\s+in\s*(?=[.,;:!?\n)])/gi, "");
  // Orphan copula left dangling after removals: " is ." / " is ," / " is\n"
  // (e.g. "Speedy Gonzalez is ." after stripping "located in {{project_location}}").
  out = out.replace(/\s+\bis\s*(?=[.,;:!?])/gi, "");
  out = out.replace(/\s+\bis\s*$/gim, "");
  // Tidy " ." spacing produced by removals (e.g. "Subject ." → "Subject.").
  out = out.replace(/\s+([.,;:!?])/g, "$1");
  // Drop bare-subject stub lines left after the predicate was stripped.
  // Two cases:
  //   - With markdown emphasis (`**Subject**.`) — short noun phrase ≤ 4 words.
  //   - Without emphasis — only single-word stubs (`Subject.`), so legitimate
  //     short sentences like "Project Lighthouse." or "Intro line." survive.
  out = out
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/\s{2,}/g, " ").trimEnd();
      if (/^[\s.,;:]*$/.test(trimmed)) return "";
      // Drop bare-subject stub lines left after the predicate was stripped.
      // Two cases — both require a trailing period to avoid eating legitimate
      // heading-style lines like a standalone `**Project Name**` paragraph:
      //   - With markdown emphasis (`**Subject**.`) — short noun phrase ≤ 4 words.
      //   - Without emphasis — only single-word stubs (`Subject.`), so legitimate
      //     short sentences like "Project Lighthouse." or "Intro line." survive.
      const hasEmphasis = /[*_]/.test(trimmed);
      const bare = trimmed.replace(/[*_]/g, "").trim();
      if (/^[A-Za-z0-9][^.,;:!?]*\.$/.test(bare)) {
        const wordCount = bare.slice(0, -1).trim().split(/\s+/).length;
        const limit = hasEmphasis ? 4 : 1;
        if (wordCount <= limit) return "";
      }
      return trimmed;
    })
    .join("\n");
  // Collapse 3+ blank lines into max two.
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/^\n+|\n+$/g, "");
  // Tidy double spaces inside a line.
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}

// ──────────────────────── Computed snapshot ────────────────────────

function buildComputed(
  ctx: QuoteContext,
  currency: string,
): GeneratedSnapshot["computed"] {
  const rollup = rollupQuote({
    allocations: ctx.allocations,
    externalServices: ctx.externalServices,
    pricingMultiplier: ctx.quote.pricing_multiplier,
  });

  // Stages, ordered.
  const stages = [...ctx.stages]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      id: s.id,
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
    }));

  // Project timeline = min/max across stages.
  const timeline = stages.length
    ? {
        start_date: stages.reduce(
          (min, s) => (!min || s.start_date < min ? s.start_date : min),
          null as string | null,
        ),
        end_date: stages.reduce(
          (max, s) => (!max || s.end_date > max ? s.end_date : max),
          null as string | null,
        ),
      }
    : { start_date: null, end_date: null };

  // Roles aggregated by role label (client-safe — no individual names).
  const roleMap = new Map<string, number>();
  for (const a of ctx.allocations) {
    const role =
      (a.resource && (a.resource as { role?: string | null }).role) ||
      "Team Member";
    const { hours } = quoteAllocationLine(a);
    roleMap.set(role, (roleMap.get(role) ?? 0) + hours);
  }
  const rolesByLabel = Array.from(roleMap.entries())
    .map(([role, hours]) => ({ role, hours: Math.round(hours) }))
    .sort((a, b) => b.hours - a.hours);

  // External services (client-safe view: sale price only).
  const externalServices = ctx.externalServices.map((s) => ({
    description: s.description,
    supplier: s.supplier?.name ?? null,
    sale_price: Number(s.sale_price ?? 0),
    quantity: Number(s.quantity ?? 1),
    total: Number(s.sale_price ?? 0) * Number(s.quantity ?? 1),
  }));

  // Payment schedule (resolved amounts).
  const totalFee = rollup.totalFee;
  const paymentSchedule = ctx.paymentSchedule.map((p) => {
    const value = Number(p.amount_value ?? 0);
    const amount = p.amount_type === "percent" ? totalFee * (value / 100) : value;
    return {
      label: p.label,
      amount,
      expected_invoice_date: p.expected_invoice_date,
    };
  });

  return {
    totalFee,
    internalFee: rollup.internal.value * rollup.pricingMultiplier,
    externalFee: rollup.external.value * rollup.pricingMultiplier,
    pricingMultiplier: rollup.pricingMultiplier,
    currency,
    stages,
    timeline,
    rolesByLabel,
    externalServices,
    fees: {
      internal: rollup.internal.value * rollup.pricingMultiplier,
      external: rollup.external.value * rollup.pricingMultiplier,
      total: rollup.totalFee,
    },
    paymentSchedule,
    acceptance: {
      client_name: ctx.company?.nome?.trim() || "",
      proposal_title: ctx.quote.titulo,
      total_fee: totalFee,
    },
  };
}

// ─────────────────────── Block selection ───────────────────────

function pickSlugs(input: GenerateInput): string[] {
  if (input.slugs && input.slugs.length > 0) return input.slugs;
  const exclude = new Set(input.excludeSlugs ?? []);
  let base: readonly string[];
  switch (input.proposalKind) {
    case "phased_consultancy":
      base = DEFAULT_CONSULTANCY_BLOCK_SLUGS;
      break;
    case "psa_interior_fitout":
      base = PSA_INTERIOR_BLOCK_SLUGS;
      break;
    case "construction_retainer":
      base = RETAINER_BLOCK_SLUGS;
      break;
    case "consultancy_hours_package":
      base = CONSULTANCY_HOURS_PACKAGE_BLOCK_SLUGS;
      break;
    default:
      base = DEFAULT_PROPOSAL_BLOCK_SLUGS;
  }
  return base.filter((s) => !exclude.has(s));
}

const DEFAULT_CONSULTANCY_PHASES: ReadonlyArray<{
  label: string;
  estimated_hours: number | null;
}> = [
  { label: "Phase 1 — Preliminary Feasibility", estimated_hours: null },
  { label: "Phase 2 — Detailed Feasibility & Concept Alignment", estimated_hours: null },
  { label: "Phase 3 — Planning Confirmation (PIP)", estimated_hours: null },
];

// ───────────────────────── Main generator ─────────────────────────

export function generateProposalDocument(input: GenerateInput): GenerateOutput {
  const language = input.language ?? "en";
  const currency = input.currency ?? "EUR";
  const validityDays = input.validityDays ?? 60;

  const computed = buildComputed(input.ctx, currency);
  const variables = buildVariables(
    input.ctx,
    computed.totalFee,
    currency,
    language,
    validityDays,
    input.consultancy,
  );

  const slugs = pickSlugs(input);
  const blockBySlug = new Map(
    input.masterBlocks
      .filter((b) => b.language === language)
      .map((b) => [b.slug, b] as const),
  );

  const blockDrafts: BlockDraft[] = [];
  const missingSlugs: string[] = [];

  slugs.forEach((slug, index) => {
    const master = blockBySlug.get(slug);
    if (!master) {
      missingSlugs.push(slug);
      return;
    }

    const isGenerated = master.block_type === "generated_section";
    const resolvedContent = isGenerated
      ? master.default_content
      : substituteVariables(master.default_content, variables);

    let generated_content: Record<string, unknown> | null = null;
    if (isGenerated) {
      switch (slug) {
        case "generated-stage-summary":
          generated_content = { stages: computed.stages };
          break;
        case "generated-timeline":
          generated_content = { timeline: computed.timeline };
          break;
        case "generated-role-summary":
          generated_content = { roles: computed.rolesByLabel };
          break;
        case "generated-external-services":
          generated_content = { items: computed.externalServices };
          break;
        case "generated-fee-summary":
          generated_content = { fees: computed.fees, currency };
          break;
        case "generated-payment-schedule":
          generated_content = {
            schedule: computed.paymentSchedule,
            currency,
          };
          break;
        case "generated-acceptance-block":
          generated_content = { acceptance: computed.acceptance };
          break;
        case "generated-time-fee-consultancy": {
          const c = input.consultancy ?? {};
          const hourly = c.hourly_rate ?? null;
          const block = c.hours_block ?? null;
          const minimum = c.minimum_commitment_hours ?? null;
          const blockValue =
            hourly !== null && block !== null ? hourly * block : null;
          generated_content = {
            hourly_rate: hourly,
            hours_block: block,
            minimum_commitment_hours: minimum,
            block_value: blockValue,
            currency,
          };
          break;
        }
        case "generated-consultancy-phases": {
          const phases =
            input.consultancy?.phases && input.consultancy.phases.length > 0
              ? input.consultancy.phases.map((p) => ({
                  label: p.label,
                  estimated_hours: p.estimated_hours ?? null,
                }))
              : DEFAULT_CONSULTANCY_PHASES.map((p) => ({ ...p }));
          generated_content = { phases };
          break;
        }
        default:
          generated_content = null;
      }
    }

    blockDrafts.push({
      proposal_block_id: master.id,
      block_title: master.title,
      block_type: master.block_type,
      content: resolvedContent,
      generated_content,
      sort_order: (index + 1) * 10,
      is_included: true,
      is_locked: isGenerated, // generated sections locked by default
    });
  });

  const documentDraft: DocumentDraft = {
    quote_id: input.ctx.quote.id,
    title: input.ctx.quote.titulo || "Proposal",
    language,
    status: "draft",
    revision_number: input.revisionNumber ?? 1,
    snapshot_json: {
      proposal_kind: input.proposalKind ?? "fixed_project",
      variables,
      computed,
    },
    generated_at: new Date().toISOString(),
  };

  return { documentDraft, blockDrafts, missingSlugs };
}
