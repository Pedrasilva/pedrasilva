import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
export interface CommercialReference {id:string;contracted:number|null;outsideContract:boolean;valueOwned:boolean}
export interface CommercialRead {stages:CommercialReference[];contractedTotal:number|null;hasContract?:boolean}
export function useGanttCommercial(projectId:string,enabled=true){
 return useQuery({queryKey:['pm-gantt-commercial',projectId],enabled,queryFn:async()=>{
  const {data,error}=await supabase.rpc('pm_gantt_commercial_read',{_project:projectId});if(error)throw error;
  return data as unknown as CommercialRead;
 }});
}
export function useGanttValueHistory(projectId:string,enabled=true){
 return useQuery({queryKey:['pm-gantt-value-history',projectId],enabled,queryFn:async()=>{
  const {data,error}=await supabase.from('pm_gantt_value_history').select('*').eq('project_id',projectId).order('changed_at',{ascending:false});
  if(error)throw error;return data;
 }});
}
export function useGanttValueActions(projectId:string){
 const qc=useQueryClient();
 const invalidate=async()=>{await Promise.all(['pm-project','pm-stages-all','pm-gantt-commercial','pm-gantt-value-history','pm-incoming-timing','pm-invoices','pm-invoices-all','billing-plan'].map(key=>qc.invalidateQueries({queryKey:[key]})));};
 const change=useMutation({mutationFn:async(a:{id:string;expected:number;value:number;reason:string;responsibility:boolean;clientAgreed:boolean;effectiveMonth?:string})=>{
  const {data,error}=await supabase.rpc('pm_gantt_change_value',{_stage:a.id,_expected:a.expected,_value:a.value,_reason:a.reason,_responsibility:a.responsibility,_client_agreed:a.clientAgreed,_effective_month:a.effectiveMonth});
  if(error)throw error;return data;
 },onSuccess:invalidate});
 const extend=useMutation({mutationFn:async(a:{id:string;months:number})=>{
  const {data,error}=await supabase.rpc('pm_gantt_extend_retainer',{_stage:a.id,_months:a.months});if(error)throw error;return data;
 },onSuccess:invalidate});
 return {change,extend};
}