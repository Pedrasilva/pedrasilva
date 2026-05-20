/**
 * React hook to generate a quote proposal document.
 *
 * Runs entirely client-side via the authenticated supabase client. RLS
 * permits authenticated users to read the master block library and insert
 * into quote_proposal_documents / quote_proposal_document_blocks, so we
 * skip the server-function round-trip (which previously failed because
 * useServerFn does not attach the user's Authorization header).
 *
 * Defensive errors:
 * - quote not found
 * - empty master library  → "no_blocks"
 * - missing default slugs (warned, not thrown)
 * - failed document / block insert (rolled back when possible)
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  generateProposalDocument,
  type MasterBlock,
  type MasterCategory,
  type QuoteContext,
  type ProposalKind,
  type ConsultancyConfig,
  type RetainerConfig,
} from "./proposal-generator";
import {
  parseTimeBasedSettings,
  retainerMonthlyEstimate,
  consultancyMinimumHours,
  consultancyDownpayment,
  consultancyBlockValue,
} from "./time-based-settings";
import {
  assembleProposal,
  type AssemblyAppendixToggles,
  type AssemblyFlags,
  type ProposalDeliveryMode,
  type ProposalFamily,
  type ProposalPreset,
} from "../proposal-assembly";

export interface GenerateProposalArgs {
  quoteId: string;
  language?: string;
  slugs?: string[];
  excludeSlugs?: string[];
  currency?: string;
  validityDays?: number;
  replaceExistingDraft?: boolean;
  /** Which block-set to use when no explicit slugs are provided. */
  proposalKind?: ProposalKind;
  /** Optional consultancy-specific config (used by phased_consultancy generated blocks). */
  consultancy?: ConsultancyConfig;
  /** Optional retainer-specific config; when omitted, the hook reads
   *  fee_proposals.time_based_settings and derives one for retainer quotes. */
  retainer?: RetainerConfig;
  /** Persist explicit time-based settings before generating so regeneration
   *  hydrates the same values next time. */
  persistTimeBasedSettings?: boolean;
}

export interface GenerateProposalResult {
  documentId: string;
  blocksCreated: number;
  missingSlugs: string[];
}

const WORKPLACE_APPENDICES: AssemblyAppendixToggles = {
  I: true,
  II: true,
  III: true,
  IV: true,
  V: true,
  VI: true,
};

const WORKPLACE_FLAGS: AssemblyFlags = {
  showHours: true,
  showDurations: true,
  showConsultantTrack: false,
};

function daysBetween(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function normalizeWorkplacePreset(value: unknown): ProposalPreset {
  return value === "small_fitout" || value === "headquarters" || value === "large_corporate_fitout"
    ? value
    : "large_corporate_fitout";
}

function normalizeDeliveryMode(value: unknown): ProposalDeliveryMode {
  return value === "consultant_led" || value === "design_build" || value === "psa_led"
    ? value
    : "psa_led";
}

async function createWorkplaceAssemblyDocument(args: {
  quote: Record<string, unknown>;
  language: string;
  stages: Array<Record<string, unknown>>;
  paymentSchedule: Array<Record<string, unknown>>;
}): Promise<GenerateProposalResult> {
  const quoteId = String(args.quote.id);
  const family: ProposalFamily = "workplace";
  const preset = normalizeWorkplacePreset(args.quote.ontology_preset_code);
  const deliveryMode = normalizeDeliveryMode(args.quote.ontology_delivery_mode);
  const assembled = assembleProposal({
    family,
    preset,
    deliveryMode,
    language: args.language === "en" ? "en" : "pt-PT",
    flags: WORKPLACE_FLAGS,
    addOns: [],
    appendices: WORKPLACE_APPENDICES,
    assemblyKey: `${quoteId}:${args.language}:v1`,
    data: {
      quote: {
        id: quoteId,
        code: typeof args.quote.proposal_number === "string" ? args.quote.proposal_number : null,
        title: typeof args.quote.titulo === "string" ? args.quote.titulo : null,
        project_name: typeof args.quote.titulo === "string" ? args.quote.titulo : null,
        client_name: null,
        currency: "EUR",
        proposal_date:
          typeof args.quote.data_proposta === "string"
            ? args.quote.data_proposta
            : new Date().toISOString().slice(0, 10),
        proposal_version: "v1",
      },
      stages: args.stages.map((s, index) => ({
        code: String(s.phase_code ?? s.stage_code ?? s.code ?? `P${index + 1}`),
        name: String(s.name ?? s.title ?? ""),
        start_date: typeof s.start_date === "string" ? s.start_date : null,
        end_date: typeof s.end_date === "string" ? s.end_date : null,
        duration_days:
          typeof s.duration_days === "number"
            ? s.duration_days
            : daysBetween(s.start_date as string | null, s.end_date as string | null),
        estimated_hours:
          typeof s.estimated_hours === "number" ? s.estimated_hours : null,
        fee: typeof s.budget === "number" ? s.budget : s.budget != null ? Number(s.budget) : null,
      })),
      paymentSchedule: args.paymentSchedule.map((p) => ({
        label: String(p.label ?? p.description ?? p.payment_trigger ?? p.trigger ?? ""),
        trigger: String(p.payment_trigger ?? p.trigger ?? ""),
        amount: typeof p.amount === "number" ? p.amount : p.amount != null ? Number(p.amount) : 0,
      })),
      feeBreakdown: null,
      exclusions: [],
    },
  });

  const { data: insertedDoc, error: docErr } = await supabase
    .from("quote_proposal_documents")
    .insert({
      quote_id: quoteId,
      title: String(args.quote.titulo ?? "Proposal"),
      language: args.language,
      status: "draft",
      revision_number: 1,
      snapshot_json: {
        proposal_kind: "workplace_assembly_v1",
        assembly_family: family,
        assembly_preset: preset,
        assembly_delivery_mode: deliveryMode,
      },
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (docErr || !insertedDoc) {
    throw new Error(`Failed to create assembled proposal document: ${docErr?.message ?? "unknown error"}`);
  }

  const rows = assembled.containers.flatMap((container, containerIndex) =>
    container.enabled
      ? container.blocks.map((block, blockIndex) => ({
          proposal_document_id: insertedDoc.id,
          proposal_block_id: null,
          block_title: block.title,
          block_type: "editable_text" as const,
          content: block.content,
          generated_content: {
            generated_from_assembly: true,
            container_id: container.id,
            section_id: container.sectionId,
            local_id: block.localId,
            payload: block.payload ?? null,
          },
          sort_order: (containerIndex + 1) * 100 + blockIndex * 10,
          is_included: true,
          is_locked: container.locked === "full",
          assembly_section_id: container.sectionId,
          assembly_provenance: container.provenance,
          assembly_locked: container.locked,
        }))
      : [],
  );
  if (rows.length === 0) throw new Error("Assembly planner returned no insertable blocks");
  const { error: blocksErr } = await supabase
    .from("quote_proposal_document_blocks")
    .insert(rows as never);
  if (blocksErr) {
    await supabase.from("quote_proposal_documents").delete().eq("id", insertedDoc.id);
    throw new Error(`Failed to create assembled proposal blocks: ${blocksErr.message}`);
  }

  return { documentId: insertedDoc.id as string, blocksCreated: rows.length, missingSlugs: [] };
}

async function runGenerate(
  args: GenerateProposalArgs,
): Promise<GenerateProposalResult> {
  const language = args.language ?? "en";

  // 1. Quote
  const { data: quote, error: quoteErr } = await supabase
    .from("fee_proposals")
    .select(
        "id, titulo, valor, proposal_description, pricing_multiplier, data_proposta, opportunity_id, company_id, contact_id, revision_number, quote_type, quote_category, time_based_settings, proposal_number, ontology_family_code, ontology_preset_code, ontology_delivery_mode",
    )
    .eq("id", args.quoteId)
    .maybeSingle();
  if (quoteErr) throw new Error(quoteErr.message);
  if (!quote) throw new Error("Quote not found");

  // 2. Parallel loads
  const [
    companyRes,
    contactRes,
    opportunityRes,
    stagesRes,
    allocationsRes,
    externalRes,
    paymentRes,
    invoiceSettingsRes,
    masterBlocksRes,
    masterCategoriesRes,
  ] = await Promise.all([
    quote.company_id
      ? supabase.from("companies").select("id, nome").eq("id", quote.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    quote.contact_id
      ? supabase
          .from("contacts")
          .select("id, primeiro_nome, apelido")
          .eq("id", quote.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    quote.opportunity_id
      ? supabase
          .from("crm_opportunities")
          .select("id, project_brief")
          .eq("id", quote.opportunity_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("quote_stages")
      .select("*")
      .eq("quote_id", args.quoteId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("quote_allocations")
      .select("*, resource:pm_resources(id,name,color,role)")
      .eq("quote_id", args.quoteId),
    supabase
      .from("quote_external_services")
      .select("*, supplier:pm_suppliers(id,name,active)")
      .eq("quote_id", args.quoteId),
    supabase
      .from("quote_payment_schedule_items")
      .select("*")
      .eq("quote_id", args.quoteId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pm_invoice_settings")
      .select("payment_terms_days, company_name, vat_rate")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("proposal_blocks")
      .select(
        "id, category_id, title, slug, language, block_type, visibility, default_content, variables, sort_order",
      )
      .eq("language", language)
      .eq("is_active", true),
    supabase
      .from("proposal_block_categories")
      .select("id, slug, name, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  const firstError = [
    stagesRes.error,
    allocationsRes.error,
    externalRes.error,
    paymentRes.error,
    masterBlocksRes.error,
    masterCategoriesRes.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const isWorkplaceAssemblyRequest =
    args.proposalKind === "psa_interior_fitout" ||
    (quote.ontology_family_code === "workplace" && args.proposalKind === "fixed_project");
  if (isWorkplaceAssemblyRequest) {
    return createWorkplaceAssemblyDocument({
      quote: quote as Record<string, unknown>,
      language,
      stages: (stagesRes.data ?? []) as Array<Record<string, unknown>>,
      paymentSchedule: (paymentRes.data ?? []) as Array<Record<string, unknown>>,
    });
  }

  const masterBlocks = (masterBlocksRes.data ?? []) as MasterBlock[];
  if (masterBlocks.length === 0) {
    const err = new Error("no_blocks");
    err.name = "EmptyLibraryError";
    throw err;
  }

  const ctx: QuoteContext = {
    quote: {
      id: quote.id,
      titulo: quote.titulo,
      valor: Number(quote.valor ?? 0),
      proposal_description: quote.proposal_description,
      pricing_multiplier: Number(quote.pricing_multiplier ?? 1),
      data_proposta: quote.data_proposta,
    },
    company: companyRes.data ?? null,
    contact: contactRes.data ?? null,
    opportunity: opportunityRes.data ?? null,
    stages: stagesRes.data ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allocations: (allocationsRes.data ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externalServices: (externalRes.data ?? []) as any,
    paymentSchedule: paymentRes.data ?? [],
    invoiceSettings: invoiceSettingsRes.data ?? null,
    // Threaded into buildComputed so totalFee / acceptance are populated
    // for time-based and retainer workflows.
    timeBasedSettings: null, // populated below once parsed
    quoteCategory: (quote.quote_category as
      | "project"
      | "time_based"
      | "retainer"
      | "consultancy"
      | null) ?? null,
  };

  // Derive consultancy/retainer configs from saved time_based_settings
  // when caller did not pass explicit values.
  //
  // IMPORTANT: when the chosen proposalKind is a time-based one
  // (consultancy_hours_package / construction_retainer) but the quote's
  // commercial type is "standard_project", we still want to honour any
  // settings the author saved via the Time-based tab kind picker. We
  // therefore prefer args.proposalKind as the type hint when it maps to
  // a time-based kind, and only fall back to the DB quote_type otherwise.
  const proposalKindHint: string | null | undefined =
    args.proposalKind === "consultancy_hours_package" ||
    args.proposalKind === "phased_consultancy"
      ? "consultancy_hours_package"
      : args.proposalKind === "construction_retainer"
        ? "construction_retainer"
        : quote.quote_type;
  const parsedSettings = parseTimeBasedSettings(
    quote.time_based_settings,
    proposalKindHint,
  );
  // Wire parsed settings into the generator context so totalFee /
  // acceptance / fee summary are non-zero for time-based / retainer.
  ctx.timeBasedSettings = parsedSettings;
  let derivedConsultancy: ConsultancyConfig | undefined = args.consultancy;
  let derivedRetainer: RetainerConfig | undefined = args.retainer;
  if (!derivedConsultancy && parsedSettings?.kind === "consultancy_hours_package") {
    derivedConsultancy = {
      hourly_rate: parsedSettings.hourly_rate,
      hours_block: parsedSettings.hours_block,
      minimum_commitment_hours: consultancyMinimumHours(parsedSettings),
      block_value: consultancyBlockValue(parsedSettings),
      downpayment_amount: consultancyDownpayment(parsedSettings),
      phases: parsedSettings.phases,
    };
  }
  if (!derivedRetainer && parsedSettings?.kind === "construction_retainer") {
    derivedRetainer = {
      start_date: parsedSettings.start_date,
      estimated_end_date: parsedSettings.estimated_end_date,
      construction_duration_months: null,
      monthly_estimate: retainerMonthlyEstimate(parsedSettings),
      monthly_resources: parsedSettings.monthly_resources,
      reimbursable_expenses_note: parsedSettings.reimbursable_expenses_note,
    };
  }

  if (args.persistTimeBasedSettings && (args.consultancy || args.retainer)) {
    const settings = args.consultancy
      ? {
          kind: "consultancy_hours_package" as const,
          hourly_rate: args.consultancy.hourly_rate ?? null,
          hours_block: args.consultancy.hours_block ?? null,
          minimum_commitment_percent:
            args.consultancy.hours_block && args.consultancy.minimum_commitment_hours
              ? (args.consultancy.minimum_commitment_hours / args.consultancy.hours_block) * 100
              : 30,
          billing_mode: "monthly_actual" as const,
          phases: args.consultancy.phases ?? [],
        }
      : {
          kind: "construction_retainer" as const,
          start_date: args.retainer?.start_date ?? null,
          estimated_end_date: args.retainer?.estimated_end_date ?? null,
          construction_duration_months:
            args.retainer?.construction_duration_months ?? null,
          monthly_estimate: args.retainer?.monthly_estimate ?? null,
          billing_mode: "monthly_advance" as const,
          monthly_resources: args.retainer?.monthly_resources ?? [],
          reimbursable_expenses_note:
            args.retainer?.reimbursable_expenses_note ?? "",
        };
    const { error: persistErr } = await supabase
      .from("fee_proposals")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ time_based_settings: settings as any })
      .eq("id", args.quoteId);
    if (persistErr) throw new Error(persistErr.message);
  }

  const { documentDraft, blockDrafts, missingSlugs } = generateProposalDocument({
    ctx,
    masterBlocks,
    masterCategories: (masterCategoriesRes.data ?? []) as MasterCategory[],
    language,
    slugs: args.slugs,
    excludeSlugs: args.excludeSlugs,
    currency: args.currency,
    validityDays: args.validityDays,
    revisionNumber: 1,
    proposalKind: args.proposalKind,
    consultancy: derivedConsultancy,
    retainer: derivedRetainer,
  });

  // 3. Replace existing draft if requested.
  if (args.replaceExistingDraft) {
    const { data: existing } = await supabase
      .from("quote_proposal_documents")
      .select("id")
      .eq("quote_id", args.quoteId)
      .eq("status", "draft");
    if (existing && existing.length > 0) {
      const ids = existing.map((r) => r.id);
      const { data: assembledDraftBlocks, error: assembledDraftErr } = await supabase
        .from("quote_proposal_document_blocks")
        .select("proposal_document_id")
        .in("proposal_document_id", ids)
        .not("assembly_section_id", "is", null);
      if (assembledDraftErr) {
        throw new Error(`Could not inspect assembled drafts: ${assembledDraftErr.message}`);
      }
      const assembledDraftIds = new Set(
        (assembledDraftBlocks ?? []).map((r) => r.proposal_document_id),
      );
      const replaceableIds = ids.filter((id) => !assembledDraftIds.has(id));
      if (replaceableIds.length === 0) {
        return {
          documentId: ids[0] as string,
          blocksCreated: 0,
          missingSlugs: [],
        };
      }
      const { error: delErr } = await supabase
        .from("quote_proposal_documents")
        .delete()
        .in("id", replaceableIds);
      if (delErr) throw new Error(`Could not replace draft: ${delErr.message}`);
    }
  }

  // 4. Insert document.
  const { data: insertedDoc, error: docErr } = await supabase
    .from("quote_proposal_documents")
    .insert({
      quote_id: documentDraft.quote_id,
      title: documentDraft.title,
      language: documentDraft.language,
      status: documentDraft.status,
      revision_number: documentDraft.revision_number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshot_json: documentDraft.snapshot_json as any,
      generated_at: documentDraft.generated_at,
    })
    .select("id")
    .single();
  if (docErr || !insertedDoc) {
    throw new Error(
      `Failed to create proposal document: ${docErr?.message ?? "unknown error"}`,
    );
  }

  // 5. Insert blocks.
  if (blockDrafts.length > 0) {
    const rows = blockDrafts.map((b) => ({
      proposal_document_id: insertedDoc.id,
      proposal_block_id: b.proposal_block_id,
      block_title: b.block_title,
      block_type: b.block_type,
      content: b.content,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generated_content: b.generated_content as any,
      sort_order: b.sort_order,
      is_included: b.is_included,
      is_locked: b.is_locked,
    }));
    const { error: blocksErr } = await supabase
      .from("quote_proposal_document_blocks")
      .insert(rows);
    if (blocksErr) {
      // Roll back parent document.
      await supabase
        .from("quote_proposal_documents")
        .delete()
        .eq("id", insertedDoc.id);
      throw new Error(`Failed to create proposal blocks: ${blocksErr.message}`);
    }
  }

  return {
    documentId: insertedDoc.id as string,
    blocksCreated: blockDrafts.length,
    missingSlugs,
  };
}

export function useGenerateQuoteProposalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runGenerate,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["quote-proposal-documents", vars.quoteId],
      });
    },
  });
}
