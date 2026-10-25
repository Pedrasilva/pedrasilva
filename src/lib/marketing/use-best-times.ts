import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { bestTimes, type ActivitySnapshot, type TimingFormat } from './best-times';
import type { PostRow } from './instagram-insights';

export function useBestTimes(format: TimingFormat) {
  const query = useQuery({ queryKey: ['marketing-best-times'], staleTime: 60000, refetchInterval: 300000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('marketing_best_times_data');
      if (error) throw error;
      return data as unknown as { posts: PostRow[]; activity: ActivitySnapshot[] };
    } });
  return { ...query, map: bestTimes(query.data?.posts ?? [], query.data?.activity ?? [], format) };
}