import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {defaultSale,hourBudget,stageHourBudgets,hoursStatus,type HourBudget,type BudgetStage} from './hour-budget';
export interface ProjectHourProjection {projectId:string;total:HourBudget;stages:{id:string;name:string;parentId:string|null;kind:string;hours:HourBudget;financial?:{spent:number|null;remaining:number|null}}[];financial?:{averageSale:number|null;rateSource:'team'|'practice'};}
export const getProjectHourBudgets=createServerFn({method:'GET'})
 .middleware([requireSupabaseAuth])
 .inputValidator((input?:{projectId?:string})=>input??{})
 .handler(async({context,data}):Promise<ProjectHourProjection[]>=>{
  const {supabase}=context;
  const {data:visible,error}=await supabase.from('pm_projects').select('id').eq('finance_only',false);
  if(error)throw error;
  const allowed:string[]=[];const financial=new Set<string>();
  const staff=await supabase.rpc('is_psa_staff');if(staff.error)throw staff.error;if(!staff.data)return [];
  await Promise.all((visible??[]).filter(p=>!data.projectId||data.projectId===p.id).map(async p=>{
   // Visible rows already passed caller RLS. Financial-area helpers are not operational-access gates.
   allowed.push(p.id);const gate=await supabase.rpc('pm_project_rate_access',{_project:p.id});if(gate.error)throw gate.error;if(gate.data)financial.add(p.id);
  }));
  if(!allowed.length)return [];
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {loadInputs,currentHrCosts}=await import('./cost-rates.server');
  const inputs=await loadInputs(db);const costs=currentHrCosts(inputs,new Date().toISOString().slice(0,10));
  const [projects,stages,teams,resources,overrides]=await Promise.all([
   db.from('pm_projects').select('id,sold_internal_fee,planned_hours_target').in('id',allowed),
   db.from('pm_stages').select('*').in('project_id',allowed).is('archived_at',null).neq('status','cancelled'),
   db.from('pm_project_team').select('project_id,resource_id').in('project_id',allowed),
   db.from('pm_resources').select('id,collaborator_id,hourly_rate,hourly_rate_is_override'),
   db.from('pm_project_rate_overrides').select('*').in('project_id',allowed),
  ]);for(const r of [projects,stages,teams,resources,overrides])if(r.error)throw r.error;
  const ss=stages.data??[];const ids=ss.map(s=>s.id);
  const allocations=ids.length?await db.from('pm_allocations').select('id,stage_id').in('stage_id',ids):{data:[],error:null};if(allocations.error)throw allocations.error;
  const allocationMap=new Map((allocations.data??[]).map(a=>[a.id,a.stage_id]));
  const tasks=allocationMap.size?await db.from('pm_tasks').select('id,allocation_id').in('allocation_id',Array.from(allocationMap.keys())):{data:[],error:null};if(tasks.error)throw tasks.error;
  const taskMap=new Map((tasks.data??[]).map(t=>[t.id,allocationMap.get(t.allocation_id)]));
  // Paginate all project entries; direct stage and task attribution are equivalent.
  const entries: {hours:number;pm_stage_id:string|null;task_id:string|null;cost_rate_snapshot:number|null}[]=[];
  if(ids.length){for(let offset=0;;offset+=1000){
   const clauses=[`pm_stage_id.in.(${ids.join(',')})`];if(taskMap.size)clauses.push(`task_id.in.(${Array.from(taskMap.keys()).join(',')})`);
   const r=await db.from('pm_time_entries').select('hours,pm_stage_id,task_id,cost_rate_snapshot').eq('entry_type','project').or(clauses.join(',')).order('id').range(offset,offset+999);if(r.error)throw r.error;entries.push(...r.data);if(r.data.length<1000)break;
  }}
  const used=new Map<string,number>();const spent=new Map<string,number|null>();
  for(const e of entries){const id=e.pm_stage_id??(e.task_id?taskMap.get(e.task_id):undefined);if(!id)continue;used.set(id,(used.get(id)??0)+Number(e.hours));const previous=spent.get(id);spent.set(id,previous===null||e.cost_rate_snapshot==null?null:(previous??0)+Number(e.hours)*Number(e.cost_rate_snapshot));}
  const byResource=new Map((resources.data??[]).map(r=>[r.id,r]));
  const practice=Array.from(costs.values()).filter((n):n is number=>n!=null&&n>0).map(defaultSale);
  return (projects.data??[]).map(p=>{
   const team=(teams.data??[]).filter(t=>t.project_id===p.id).map(t=>byResource.get(t.resource_id)).filter(r=>r?.collaborator_id&&costs.has(r.collaborator_id));
   const sales=team.map(r=>{if(!r?.collaborator_id)return null;const override=overrides.data?.find(o=>o.project_id===p.id&&o.resource_id===r.id&&o.enabled);if(override&&override.project_rate>0)return Number(override.project_rate);if(r.hourly_rate_is_override&&Number(r.hourly_rate)>0)return Number(r.hourly_rate);const cost=costs.get(r.collaborator_id);return cost!=null&&cost>0?defaultSale(cost):null;});
   const pool=team.length?sales:practice;const avg=pool.length&&pool.every((n):n is number=>n!=null&&n>0)?pool.reduce((n,r)=>n+r,0)/pool.length:null;
   const stagesForProject=ss.filter(s=>s.project_id===p.id) as BudgetStage[];
   const budgets=stageHourBudgets(stagesForProject,avg,used);const roots=stagesForProject.filter(s=>s.is_self&&s.stage_kind!=='retainer_month'&&(!s.parent_stage_id||!stagesForProject.some(c=>c.id===s.parent_stage_id)));
   const rows=roots.map(s=>budgets.get(s.id)).filter((r):r is HourBudget=>!!r);const meaningful=rows.filter(r=>r.planned!=null);const log=rows.reduce((n,r)=>n+r.used,0);
   let total=hourBudget(p.sold_internal_fee,avg,log,p.planned_hours_target);
   if(p.planned_hours_target==null&&stagesForProject.length){const missingRate=rows.some(r=>r.origin==='rateMissing');const planned=meaningful.length&&!missingRate?meaningful.reduce((n,r)=>n+(r.planned??0),0):null;total={planned,used:log,remaining:planned==null?null:planned-log,origin:planned==null?(missingRate?'rateMissing':'feeMissing'):meaningful.every(r=>r.origin==='manual')?'manual':'estimate',status:hoursStatus(planned,log)};}
   function stageSpent(id:string,seen=new Set<string>()):number|null{if(seen.has(id))return null;seen.add(id);let sum=spent.get(id)??0;if(spent.get(id)===null)return null;for(const child of stagesForProject.filter(s=>s.parent_stage_id===id)){const n=stageSpent(child.id,seen);if(n==null)return null;sum+=n;}return sum;}
   return {projectId:p.id,total,stages:ss.filter(s=>s.project_id===p.id).map(s=>{const h=budgets.get(s.id)??hourBudget(null,null,0);const cost=stageSpent(s.id);return {id:s.id,name:s.name,parentId:s.parent_stage_id,kind:s.stage_kind,hours:h,...(financial.has(p.id)?{financial:{spent:cost,remaining:s.budget==null||cost==null?null:Number(s.budget)-cost}}:{})};}),...(financial.has(p.id)?{financial:{averageSale:avg,rateSource:team.length?'team' as const:'practice' as const}}:{})};
  });
 });