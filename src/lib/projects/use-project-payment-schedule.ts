import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { IncomingTiming } from './payment-timing';
export function useProjectIncomingTiming(projectId:string) {
  return useQuery({queryKey:['pm-incoming-timing',projectId],queryFn:async()=>{
    const {data,error}=await supabase.rpc('pm_project_incoming_timing',{_project:projectId});
    if(error) throw error;
    return data as unknown as IncomingTiming;
  }});
}
export function useChangePaymentDates(projectId:string) {
  const qc=useQueryClient();
  return useMutation({mutationFn:async(input:{id:string;patch:Record<string,string|number|null>;reason:string})=>{
    const {data,error}=await supabase.rpc('pm_change_payment_dates',{_item:input.id,_patch:input.patch,_reason:input.reason});
    if(error) throw error;
    return data;
  },onSuccess:async()=>{await qc.invalidateQueries({queryKey:['pm-incoming-timing',projectId]});}});
}