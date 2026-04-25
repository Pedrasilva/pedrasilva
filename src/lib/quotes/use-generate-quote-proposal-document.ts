/**
 * React hook to invoke the proposal document generator.
 *
 * Wraps the createServerFn call in a React Query mutation so it integrates
 * cleanly with caches and pending state. The QuoteProposalTab UI is NOT
 * wired up in this pass — this hook is ready for the next pass.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateQuoteProposalDocument } from "./proposal-generator.functions";

export interface GenerateProposalArgs {
  quoteId: string;
  language?: string;
  slugs?: string[];
  excludeSlugs?: string[];
  currency?: string;
  validityDays?: number;
  replaceExistingDraft?: boolean;
}

export function useGenerateQuoteProposalDocument() {
  const qc = useQueryClient();
  const fn = useServerFn(generateQuoteProposalDocument);

  return useMutation({
    mutationFn: async (args: GenerateProposalArgs) => {
      return fn({ data: args });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["quote-proposal-documents", vars.quoteId],
      });
    },
  });
}
