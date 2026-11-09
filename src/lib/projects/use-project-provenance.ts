import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isGeneratedProjectQuote } from "./project-provenance";

/** Keep financial quote links intact; distinguish reverse-generated snapshots at presentation. */
export function useProjectProvenance(quoteId: string | null | undefined) {
  return useQuery({
    queryKey: ["pm-project-provenance", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      if (!quoteId) return null;
      const { data, error } = await supabase.from("fee_proposals").select("id,notas").eq("id", quoteId).maybeSingle();
      if (error) throw error;
      // An inaccessible row is not evidence that an existing source may be ignored.
      return { generated: isGeneratedProjectQuote(data), sourceQuoteId: isGeneratedProjectQuote(data) ? null : quoteId };
    },
  });
}