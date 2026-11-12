import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
export interface QuoteCommercialState {hasContract:boolean;contractedTotal:number|null;referencePending:boolean;stages:Array<{id:string;budget:number;monthly:number|null;months:number|null}>}
export function useQuoteCommercial(quoteId:string,enabled=true){
 return useQuery({queryKey:['quote-commercial',quoteId],enabled,staleTime:0,queryFn:async()=>{
  const {data,error}=await supabase.rpc('quote_commercial_state',{_quote:quoteId});
  if(error)throw error;
  return data as unknown as QuoteCommercialState;
 }});
}