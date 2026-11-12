import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PsaProposal } from './types';

export function mainProposalOptions(quoteId: string) {
  return {
    // New shared key deliberately discards all legacy recency-based caches.
    queryKey: ['quote-main-proposal', quoteId],
    staleTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: 'always' as const,
    refetchInterval: 5000,
    queryFn: async (): Promise<PsaProposal | null> => {
      const { data: quote, error } = await supabase.from('fee_proposals')
        .select('main_proposal_id').eq('id', quoteId).single();
      if (error) throw error;
      if (!quote.main_proposal_id) {
        // Missing is not permission to create over ambiguous legacy documents.
        const { data: existing, error: lookupError } = await supabase.from('psa_proposals')
          .select('id').eq('quote_id', quoteId).limit(1);
        if (lookupError) throw lookupError;
        if (existing?.length) throw new Error('Main proposal document not assigned');
        return null;
      }
      const { data, error: documentError } = await supabase.from('psa_proposals')
        .select('*').eq('quote_id', quoteId).eq('id', quote.main_proposal_id).single();
      if (documentError) throw documentError;
      return data as unknown as PsaProposal;
    },
  };
}

export function useMainProposal(quoteId: string) {
  return useQuery(mainProposalOptions(quoteId));
}