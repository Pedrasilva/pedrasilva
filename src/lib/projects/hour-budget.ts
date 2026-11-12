import { PROJECT_DEFAULT_MARGIN } from './sale-margin';
export type HourStatus = 'ok'|'warn'|'bad'|'none';
export type HourOrigin = 'manual'|'estimate'|'summary'|'feeMissing'|'rateMissing'|'external';
export interface HourBudget { planned:number|null;used:number;remaining:number|null;origin:HourOrigin;status:HourStatus; }
export function hoursStatus(planned:number|null,used:number):HourStatus {
  if(planned==null)return 'none';
  if(used>planned)return 'bad';
  return planned>0&&used/planned>=0.85?'warn':'ok';
}
export function hourBudget(fee:number|null,rate:number|null,used:number,manual:number|null=null):HourBudget {
  const origin:HourOrigin=manual!=null?'manual':fee==null||fee<=0?'feeMissing':rate==null||rate<=0?'rateMissing':'estimate';
  const planned=manual??(origin==='estimate'&&fee!=null&&rate!=null?fee/rate:null);
  return {planned,used,remaining:planned==null?null:planned-used,origin,status:hoursStatus(planned,used)};
}
export const defaultSale=(cost:number)=>cost*(1+PROJECT_DEFAULT_MARGIN);
export interface BudgetStage {id:string;parent_stage_id:string|null;budget:number|null;stage_kind:string;is_self:boolean;commercial_value_owned:boolean;planned_hours_target:number|null;retainer_monthly_amount:number|null;retainer_months:number|null;}
export function stageHourBudgets(stages:BudgetStage[],rate:number|null,used:ReadonlyMap<string,number>) {
  const rows=new Map<string,HourBudget>();const visiting=new Set<string>();
  function visit(s:BudgetStage):HourBudget {
    const cached=rows.get(s.id);if(cached)return cached;
    if(visiting.has(s.id))throw new Error('Invalid stage hierarchy');visiting.add(s.id);
    const children=stages.filter(c=>c.parent_stage_id===s.id);
    let result:HourBudget;
    if(!s.is_self)result={planned:null,used:used.get(s.id)??0,remaining:null,origin:'external',status:'none'};
    else if(s.stage_kind==='retainer_monthly') {
      const monthly=Number(s.retainer_monthly_amount)||0;const fee=monthly>0?monthly*(s.retainer_months??0):s.budget;
      const logged=(used.get(s.id)??0)+children.reduce((n,c)=>n+(used.get(c.id)??0),0);
      result=hourBudget(fee,rate,logged,s.planned_hours_target);
      children.forEach(c=>rows.set(c.id,hourBudget(c.budget,rate,used.get(c.id)??0,c.planned_hours_target)));
    } else if(children.length&&!s.commercial_value_owned) {
      const childRows=children.filter(c=>c.is_self).map(visit);const log=(used.get(s.id)??0)+childRows.reduce((n,c)=>n+c.used,0);
      const incomplete=childRows.some(c=>c.origin==='rateMissing');const meaningful=childRows.filter(c=>c.planned!=null);
      result=hourBudget(null,rate,log,s.planned_hours_target);
      if(s.planned_hours_target==null&&meaningful.length&&!incomplete){const planned=meaningful.reduce((n,c)=>n+(c.planned??0),0);result={planned,used:log,remaining:planned-log,origin:'summary',status:hoursStatus(planned,log)};}
      else if(incomplete)result={planned:null,used:log,remaining:null,origin:'rateMissing',status:'none'};
    } else {const log=(used.get(s.id)??0)+children.map(visit).reduce((n,c)=>n+c.used,0);result=hourBudget(s.budget,rate,log,s.planned_hours_target);}
    visiting.delete(s.id);rows.set(s.id,result);return result;
  }
  stages.forEach(visit);return rows;
}