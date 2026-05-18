/**
 * Quote Templates — foundation hooks.
 *
 * Templates are reusable snapshots of quote structure (stages, deps,
 * external services, payment rules, proposal blocks). They are
 * one-shot generators: once instantiated into a quote, the quote has
 * no live link back to the template.
 *
 * Type note: the generated Supabase types have not yet picked up the
 * new `quote_template*` tables — we use a narrow `any` cast on the
 * client for those calls, mirroring the convention already in use in
 * the quote workspace route.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteCategory } from "@/lib/crm/types";

export type QuoteTemplateCategory = QuoteCategory; // 'project' | 'time_based' | 'retainer' | 'consultancy'
export type QuoteTemplateProjectType =
  | "office"
  | "hotel"
  | "residential"
  | "mixed_use"
  | "due_diligence"
  | "construction"
  | "generic";

export const QUOTE_TEMPLATE_PROJECT_TYPES: QuoteTemplateProjectType[] = [
  "office",
  "hotel",
  "residential",
  "mixed_use",
  "due_diligence",
  "construction",
  "generic",
];

export type QuoteTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  category: QuoteTemplateCategory;
  project_type: QuoteTemplateProjectType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type QuoteTemplateWithCounts = QuoteTemplateRow & {
  stages_count: number;
  payment_rules_count: number;
  blocks_count: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useQuoteTemplates() {
  return useQuery({
    queryKey: ["quote_templates"],
    queryFn: async (): Promise<QuoteTemplateWithCounts[]> => {
      const { data: tpls, error } = await sb
        .from("quote_templates")
        .select("id,name,description,category,project_type,is_active,created_at,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const ids = (tpls ?? []).map((t: QuoteTemplateRow) => t.id);
      if (ids.length === 0) return [];

      const [{ data: stages }, { data: rules }, { data: blocks }] = await Promise.all([
        sb.from("quote_template_stages").select("template_id").in("template_id", ids),
        sb.from("quote_template_payment_rules").select("template_id").in("template_id", ids),
        sb.from("quote_template_blocks").select("template_id").in("template_id", ids),
      ]);
      const tally = (rows: { template_id: string }[] | null | undefined) => {
        const m = new Map<string, number>();
        (rows ?? []).forEach((r) => m.set(r.template_id, (m.get(r.template_id) ?? 0) + 1));
        return m;
      };
      const s = tally(stages), p = tally(rules), b = tally(blocks);
      return (tpls ?? []).map((t: QuoteTemplateRow) => ({
        ...t,
        stages_count: s.get(t.id) ?? 0,
        payment_rules_count: p.get(t.id) ?? 0,
        blocks_count: b.get(t.id) ?? 0,
      }));
    },
  });
}

export function useDeleteQuoteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await sb.from("quote_templates").delete().eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote_templates"] }),
  });
}

export function useSaveQuoteAsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      quoteId: string;
      name: string;
      description?: string | null;
      category: QuoteTemplateCategory;
      project_type: QuoteTemplateProjectType;
    }): Promise<string> => {
      const { data, error } = await sb.rpc("quote_save_as_template", {
        _quote_id: args.quoteId,
        _name: args.name,
        _description: args.description ?? null,
        _category: args.category,
        _project_type: args.project_type,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote_templates"] }),
  });
}

export type InstantiateResult = {
  stages: number;
  dependencies: number;
  external_services: number;
  payment_items: number;
  proposal_blocks: number;
  allocations_skipped: number;
};

export function useInstantiateQuoteTemplate() {
  return useMutation({
    mutationFn: async (args: {
      quoteId: string;
      templateId: string;
      baseStartDate?: string | null;
    }): Promise<InstantiateResult> => {
      const { data, error } = await sb.rpc("quote_instantiate_template", {
        _quote_id: args.quoteId,
        _template_id: args.templateId,
        _base_start_date: args.baseStartDate ?? null,
      });
      if (error) throw error;
      return data as InstantiateResult;
    },
  });
}
