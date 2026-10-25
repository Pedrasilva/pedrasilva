import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDraftApprovalState(draftId: string) {
  return useQuery({
    queryKey: ['marketing-draft-approval-state', draftId],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_draft_approval_state').select('valid_approval,current_hash').eq('id', draftId).single();
      if (error) throw error;
      return data;
    },
  });
}