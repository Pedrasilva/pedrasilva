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
} from "./proposal-generator";

export interface GenerateProposalArgs {
  quoteId: string;
  language?: string;
  slugs?: string[];
  excludeSlugs?: string[];
  currency?: string;
  validityDays?: number;
  replaceExistingDraft?: boolean;
}

export interface GenerateProposalResult {
  documentId: string;
  blocksCreated: number;
  missingSlugs: string[];
}

async function runGenerate(
  args: GenerateProposalArgs,
): Promise<GenerateProposalResult> {
  const language = args.language ?? "en";

  // 1. Quote
  const { data: quote, error: quoteErr } = await supabase
    .from("fee_proposals")
    .select(
      "id, titulo, proposal_description, pricing_multiplier, data_proposta, opportunity_id, company_id, contact_id, revision_number",
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
      .select("id, name, start_date, end_date, sort_order")
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
  };

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
      const { error: delErr } = await supabase
        .from("quote_proposal_documents")
        .delete()
        .in("id", ids);
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
