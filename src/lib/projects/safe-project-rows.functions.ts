import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {Json} from '@/integrations/supabase/types';
const privateFields=new Set(['budget','baseline_budget','cost_rate','hourly_rate','sale_rate','cost_rate_snapshot','sale_rate_snapshot','sold_fee','sold_internal_fee','sold_external_fee','sold_pricing_multiplier','retainer_monthly_amount','markup_pct','amount','cost','profit','rate','notes','baseline_notes']);
export function stripProjectMoney(row:unknown):unknown {
 if(Array.isArray(row))return row.map(stripProjectMoney);
 if(row&&typeof row==='object')return Object.fromEntries(Object.entries(row).filter(([key])=>!privateFields.has(key)).map(([key,value])=>[key,stripProjectMoney(value)]));
 return row;
}
export const safeProjectRows=createServerFn({method:'GET'}).middleware([requireSupabaseAuth])
 .inputValidator((input:{kind:'projects'|'stages'|'resources'|'entries'|'history';projectId?:string})=>{if(!['projects','stages','resources','entries','history'].includes(input.kind))throw new Error('Invalid reader');return input;})
 .handler(async({context,data})=>{
  const {supabase,userId}=context;const rows=await supabase.rpc(`pm_b1_${data.kind}` as never,{_project:data.projectId??null} as never);if(rows.error)throw rows.error;
  const visible=await supabase.from('pm_projects').select('id').eq('finance_only',false);if(visible.error)throw visible.error;
  const financial=new Set<string>();for(const p of visible.data??[]){const gate=await supabase.rpc('pm_project_rate_access',{_project:p.id});if(gate.error)throw gate.error;if(gate.data)financial.add(p.id);}
  const global=await supabase.rpc('has_role',{_user_id:userId,_role:'admin'});if(global.error)throw global.error;
  return ((rows.data??[]) as Record<string,unknown>[]).map(row=>{const id=data.projectId??(data.kind==='projects'?row.id:row.project_id);return (typeof id==='string'&&financial.has(id)||data.kind==='resources'&&!data.projectId&&global.data?row:stripProjectMoney(row)) as Json;});
 });