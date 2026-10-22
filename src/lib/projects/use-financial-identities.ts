import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Existing privacy-safe mapping; never resolve a worker from a stage booking. */
export function useFinancialIdentities() {
  return useQuery({
    queryKey: ['pm-financial-identities'], staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pm_list_user_resource_map');
      if (error) throw error;
      return new Map((data ?? []).filter(r => r.resource_id).map(r => [r.user_id, r.resource_id as string]));
    },
  });
}