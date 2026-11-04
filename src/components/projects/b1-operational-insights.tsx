import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {readB1Rows} from '@/lib/projects/b1-projection';
import type {StageWithAllocations} from '@/lib/projects/types';
import type {ProjectViewerAreas} from '@/lib/projects/project-area-tabs';
import {supabase} from '@/integrations/supabase/client';
import {allocationHours} from '@/lib/projects/gantt-utils';
import {buildStageNumberMap,sortStagesByWbs} from '@/lib/quotes/stage-numbering';

export function B1OperationalInsights({projectId,stages,areas,retainer=false}:{projectId:string;stages:StageWithAllocations[];areas?:ProjectViewerAreas;retainer?:boolean}){
  const {t,i18n}=useTranslation('projects');
  const summary=useQuery({queryKey:['pm-b1-operational-summary',projectId],queryFn:async()=>{
    const {data,error}=await supabase.rpc('pm_project_stage_hours',{p_project_id:projectId});if(error)throw error;return data??[];
  }});
  const entries=useQuery({queryKey:['pm-b1-operational-cost',projectId],queryFn:()=>readB1Rows<{pm_stage_id:string|null;quote_stage_id:string|null;task_id:string|null;hours:number;cost_rate_snapshot:number|null}>('entries',projectId)});
  const number=new Intl.NumberFormat(i18n.language,{maximumFractionDigits:1});
  const money=new Intl.NumberFormat(i18n.language,{style:'currency',currency:'EUR'});
  const labels=buildStageNumberMap(stages);
  const selected=sortStagesByWbs(stages).filter(s=>!retainer||s.stage_kind.startsWith('retainer'));
  return <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left">
    <th className="py-3">{t('gantt.projectSummary')}</th><th>{t('detail.ui.usedPlannedHours')}</th>
    {areas?.financials&&<th>{t('gantt.inspector.budget')}</th>}
    {areas?.budget_cost&&<th>{t('detail.ui.actualCost')}</th>}
  </tr></thead><tbody>{selected.map(stage=>{
    const logged=(summary.data??[]).filter(r=>r.stage_id===stage.id).reduce((n,r)=>n+Number(r.hours),0);
    const planned=stage.allocations.reduce((n,a)=>n+allocationHours(a),0);
    const rows=(entries.data??[]).filter(e=>e.pm_stage_id===stage.id||e.quote_stage_id===stage.source_quote_stage_id);
    const cost=rows.length&&rows.every(e=>e.cost_rate_snapshot!=null&&Number.isFinite(e.cost_rate_snapshot))&&Math.abs(rows.reduce((n,e)=>n+e.hours,0)-logged)<0.005?rows.reduce((n,e)=>n+e.hours*Number(e.cost_rate_snapshot),0):logged===0?0:NaN;
    return <tr key={stage.id} className="border-b border-border"><td className="py-3">{labels.get(stage.id)} {stage.name}</td><td>{number.format(logged)} / {number.format(planned)}</td>
      {areas?.financials&&<td>{Number.isFinite(stage.budget)?money.format(stage.budget):'—'}</td>}
      {areas?.budget_cost&&<td>{Number.isFinite(cost)?money.format(cost):'—'}</td>}
    </tr>;
  })}</tbody></table></div>;
}