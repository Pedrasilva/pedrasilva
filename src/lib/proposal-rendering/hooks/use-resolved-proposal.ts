/**
 * React hook that fetches the inputs needed to build a RenderContext for a
 * given quote and returns the resolved ontology-aware view.
 *
 * Backward-compatibility contract:
 * - If the underlying fee_proposal has no ontology metadata, `applied`
 *   is false and the caller falls back to the existing proposal builder.
 * - This hook does NOT write to the proposal document; it only resolves
 *   the view. UI integration into the builder is left to a follow-up
 *   milestone so that drag/drop, include/exclude and edit behaviour
 *   remain untouched.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/integrations/supabase/client";
import type { PhaseCode } from "@/lib/proposal-ontology/types";

import { buildRenderContext } from "../resolvers/build-context";
import { resolveProposalView } from "../resolve";
import type {
  Locale,
  ProposalRenderKind,
  RenderTokens,
  ResolvedProposalView,
} from "../types";

export interface UseResolvedProposalArgs {
  quoteId: string | undefined;
  proposalKind: ProposalRenderKind;
  tokens?: RenderTokens;
}

export function useResolvedProposal(
  args: UseResolvedProposalArgs,
): { view: ResolvedProposalView | null; isLoading: boolean } {
  const { quoteId, proposalKind, tokens } = args;
  const { i18n } = useTranslation();
  const locale: Locale = i18n.language === "pt-PT" ? "pt-PT" : "en";

  const q = useQuery({
    queryKey: ["proposal-rendering", "inputs", quoteId, locale, proposalKind],
    enabled: Boolean(quoteId),
    staleTime: 60_000,
    queryFn: async () => {
      // `quoteId` is the fee_proposals.id (PSA Hub uses a single table for
      // quotes and proposals). Pull the ontology slice directly.
      const { data: fp } = await supabase
        .from("fee_proposals")
        .select(
          "id, ontology_family_code, ontology_preset_code, ontology_flags, ontology_metadata",
        )
        .eq("id", quoteId!)
        .maybeSingle();

      const { data: stages } = await supabase
        .from("quote_stages")
        .select("phase_code, addon_module_code")
        .eq("quote_id", quoteId!);

      const phases = Array.from(
        new Set(
          (stages ?? [])
            .map((s) => s.phase_code)
            .filter((p): p is string => Boolean(p)),
        ),
      ) as PhaseCode[];

      const addons = Array.from(
        new Set(
          (stages ?? [])
            .map((s) => s.addon_module_code)
            .filter((c): c is string => Boolean(c)),
        ),
      );

      return { fp, phases, addons };
    },
  });

  const view = useMemo<ResolvedProposalView | null>(() => {
    if (!q.data) return null;
    const fp = q.data.fp;
    const ctx = buildRenderContext({
      locale,
      proposalKind,
      proposal: fp
        ? {
            ontology_family_code: fp.ontology_family_code,
            ontology_preset_code: fp.ontology_preset_code,
            ontology_flags: (fp.ontology_flags ?? null) as
              | Record<string, unknown>
              | null,
            ontology_metadata: (fp.ontology_metadata ?? null) as
              | Record<string, unknown>
              | null,
          }
        : null,
      enabledPhases: q.data.phases,
      addonCodes: q.data.addons,
      tokens,
    });
    return resolveProposalView(ctx);
  }, [q.data, locale, proposalKind, tokens]);

  return { view, isLoading: q.isLoading };
}
