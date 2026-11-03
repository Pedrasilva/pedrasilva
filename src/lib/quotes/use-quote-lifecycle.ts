import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { QuoteLifecycle } from './quote-lifecycle';
export function useQuoteLifecycle(quoteId: string | undefined) {
 return useQuery({queryKey:['quote-lifecycle',quoteId],enabled:!!quoteId,staleTime:0,queryFn:async()=>{
  if(!quoteId) throw new Error('No quote id');
  const {data,error}=await supabase.rpc('crm_quote_lifecycle',{_quote:quoteId});
  if(error)throw error; return data as unknown as QuoteLifecycle;
 }});
}
