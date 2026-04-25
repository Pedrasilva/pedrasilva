/**
 * Server functions for proposal document generation.
 *
 * generateQuoteProposalDocument loads all the source data for a quote
 * (master library + quote stages/allocations/external services/payment
 * schedule + company/contact/opportunity/invoice settings), runs the
 * pure generator, and persists the resulting document + block instances.
 *
 * Uses the auth-middleware client so RLS applies as the calling user.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateProposalDocument,
  type MasterBlock,
  type MasterCategory,
  type QuoteContext,
} from "@/lib/quotes/proposal-generator";

const inputSchema = z.object({
  quoteId: z.string().uuid(),
  language: z.string().min(2).max(10).optional(),
  slugs: z.array(z.string().min(1).max(120)).max(50).optional(),
  excludeSlugs: z.array(z.string().min(1).max(120)).max(50).optional(),
  currency: z.string().min(3).max(3).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  /** When true and a draft document already exists for the quote, replace it. */
  replaceExistingDraft: z.boolean().optional(),
});

export const generateQuoteProposalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const language = data.language ?? "en";

    // 1. Load quote with related entities.
    const { data: quote, error: quoteErr } = await supabase
      .from("fee_proposals")
      .select(
        "id, titulo, proposal_description, pricing_multiplier, data_proposta, opportunity_id, company_id, contact_id, revision_number",
      )
      .eq("id", data.quoteId)
      .single();
    if (quoteErr || !quote) {
      throw new Error(quoteErr?.message ?? "Quote not found");
    }

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
        .eq("quote_id", data.quoteId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("quote_allocations")
        .select("*, resource:pm_resources(id,name,color,role)")
        .eq("quote_id", data.quoteId),
      supabase
        .from("quote_external_services")
        .select("*, supplier:pm_suppliers(id,name,active)")
        .eq("quote_id", data.quoteId),
      supabase
        .from("quote_payment_schedule_items")
        .select("*")
        .eq("quote_id", data.quoteId)
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

    // 2. Run the pure generator.
    const { documentDraft, blockDrafts, missingSlugs } = generateProposalDocument({
      ctx,
      masterBlocks: (masterBlocksRes.data ?? []) as MasterBlock[],
      masterCategories: (masterCategoriesRes.data ?? []) as MasterCategory[],
      language,
      slugs: data.slugs,
      excludeSlugs: data.excludeSlugs,
      currency: data.currency,
      validityDays: data.validityDays,
      revisionNumber: 1,
    });

    // 3. Optionally replace an existing draft for this quote.
    if (data.replaceExistingDraft) {
      const { data: existing } = await supabase
        .from("quote_proposal_documents")
        .select("id")
        .eq("quote_id", data.quoteId)
        .eq("status", "draft");
      if (existing && existing.length > 0) {
        await supabase
          .from("quote_proposal_documents")
          .delete()
          .in(
            "id",
            existing.map((r: { id: string }) => r.id),
          );
      }
    }

    // 4. Persist document.
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
      throw new Error(docErr?.message ?? "Failed to create proposal document");
    }

    // 5. Persist block instances.
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
        // Roll back the parent document on failure.
        await supabase
          .from("quote_proposal_documents")
          .delete()
          .eq("id", insertedDoc.id);
        throw new Error(blocksErr.message);
      }
    }

    return {
      documentId: insertedDoc.id as string,
      blocksCreated: blockDrafts.length,
      missingSlugs,
    };
  });
