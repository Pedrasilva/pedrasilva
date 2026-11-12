import { useMutation, useQueryClient } from '@tanstack/react-query';
import {HourBudgetPanel} from '@/components/projects/hour-budget-panel';
import { SharedPlannerInspector } from '@/components/quotes/quote-planner-inspector';
import type { PlannerInspectorModel } from './planner-inspector-model';
import { useStageDependencies,useResources,useUpdateStage,useCreateStage,useDeleteStage,useUpdateStageWithCascade,useCreateDependency,useUpdateDependency,useDeleteDependency,useCreateAllocation,useUpdateAllocation,useDeleteAllocation } from '@/lib/projects/use-planner';
import { useDefaultResourceRates } from '@/lib/projects/use-default-rates';
import { useContractBaseline } from '@/lib/projects/use-contract-baseline';
import {useGanttCommercial} from '@/lib/projects/use-gantt-commercial';
import { plannerStageRole } from '@/lib/projects/planner-stage-role';
import type { StageWithAllocations } from '@/lib/projects/types';
import type { QuoteStage, QuoteStageDependency } from '@/lib/quotes/types';
import type { QuoteAllocationWithResource } from '@/lib/quotes/use-quote-allocations';

export function ProjectInspectorAdapter({projectId,stages,stageId,onClose,readOnly,financialVisible}: {
  projectId:string;stages:StageWithAllocations[];stageId:string;onClose:()=>void;readOnly:boolean;financialVisible:boolean;
}){
  const dependencies=useStageDependencies(); const resources=useResources(projectId);
  const rates=useDefaultResourceRates(projectId); const baseline=useContractBaseline(financialVisible?projectId:undefined);
  const commercial=useGanttCommercial(projectId,financialVisible);
  const update=useUpdateStage(); const create=useCreateStage(); const remove=useDeleteStage(); const cascade=useUpdateStageWithCascade();
  const createDep=useCreateDependency();const updateDep=useUpdateDependency();const deleteDep=useDeleteDependency();
  const createAlloc=useCreateAllocation(); const updateAlloc=useUpdateAllocation();const deleteAlloc=useDeleteAllocation();
  const qc=useQueryClient();
  const upsertStage=useMutation({mutationFn:async(input:Record<string,any>)=>{
    if(readOnly)throw new Error('Forbidden');
    const {id,quote_id,manual_override,sale_source,...patch}=input;
    void quote_id;void manual_override;void sale_source;
    if(id)return update.mutateAsync({id,projectId,patch});
    return create.mutateAsync({project_id:projectId,budget:0,...patch} as Parameters<typeof create.mutateAsync>[0]);
  },onSuccess:()=>qc.invalidateQueries({queryKey:['pm-project',projectId]})});
  const delStage=useMutation({mutationFn:async(id:string)=>{if(readOnly)throw new Error('Forbidden');return remove.mutateAsync({id,projectId});}});
  const cascadeStage=useMutation({mutationFn:async(input:Record<string,any>)=>{if(readOnly)throw new Error('Forbidden');return cascade.mutateAsync({...input,projectId} as Parameters<typeof cascade.mutateAsync>[0]);}});
  const insertDependency=useMutation({mutationFn:async(input:Record<string,any>)=>{if(readOnly)throw new Error('Forbidden');return createDep.mutateAsync({predecessor_id:input.predecessor_stage_id,successor_id:input.successor_stage_id,type:input.type,lag_days:input.lag_days});}});
  const upsertAllocation=useMutation({mutationFn:async(input:Record<string,any>)=>{
    if(readOnly)throw new Error('Forbidden');
    const {id,quote_id,cost_rate_snapshot,sale_rate_snapshot,...patch}=input;
    void quote_id;void cost_rate_snapshot;void sale_rate_snapshot;
    if(id)return updateAlloc.mutateAsync({id,patch,projectId});
    return createAlloc.mutateAsync({...patch,projectId} as Parameters<typeof createAlloc.mutateAsync>[0]);
  }});
  const removeAllocation=useMutation({mutationFn:async(id:string)=>{if(readOnly)throw new Error('Forbidden');return deleteAlloc.mutateAsync({id,projectId});}});
  const ids=new Set(stages.map(s=>s.id));
  const model:PlannerInspectorModel={
    stages:stages.map(s=>({...s,quote_id:projectId,stage_role:plannerStageRole(s),sale_source:'budget'})) as unknown as QuoteStage[],
    dependencies:(dependencies.data??[]).filter(d=>ids.has(d.predecessor_id)&&ids.has(d.successor_id)).map(d=>({...d,quote_id:projectId,predecessor_stage_id:d.predecessor_id,successor_stage_id:d.successor_id})) as unknown as QuoteStageDependency[],
    allocations:stages.flatMap(s=>s.allocations).map(a=>({...a,quote_id:projectId,cost_rate_snapshot:0,sale_rate_snapshot:0})) as unknown as QuoteAllocationWithResource[],
    resources:resources.data??[],defaultRates:rates.data,quoteMargin:null,upsertStage,deleteStage:delStage,
    createDependency:insertDependency,updateDependency:updateDep,deleteDependency:deleteDep,cascadeStage,
    upsertAllocation,deleteAllocation:removeAllocation,readOnly,financialVisible,operational:true,
    contractReferencePending:financialVisible && baseline.isSuccess && (!baseline.data || baseline.data.stages.length===0),
    commercialReferences:commercial.data?.stages,
    hasContract:commercial.data?.hasContract,
    operationalStages:stages,
  };
  return <div className="flex w-[360px] shrink-0 flex-col"><HourBudgetPanel projectId={projectId} stageId={stageId} editable={!readOnly&&financialVisible}/><SharedPlannerInspector model={model} scopeId={projectId} stageId={stageId} onClose={onClose}/></div>;
}
