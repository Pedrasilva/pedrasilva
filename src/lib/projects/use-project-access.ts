import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import type {ProjectViewerAreas} from './project-area-tabs';
export function useProjectViewerAreas(projectId:string){
  return useQuery({queryKey:['pm-project-viewer-areas',projectId],queryFn:async()=>{
    const {data,error}=await supabase.rpc('pm_project_viewer_areas',{_project:projectId});if(error)throw error;
    return data as unknown as ProjectViewerAreas;
  }});
}
export const PROJECT_ACCESS_AREAS=['financials','budget_cost','expenses','supplier_fees'] as const;
export type ProjectAccessArea=typeof PROJECT_ACCESS_AREAS[number];
export type ProjectAccessRow={resource_id:string;name:string;roles:string[];revision:number;provenance:string}&Record<ProjectAccessArea,boolean>;
export function useProjectAccessPreview(projectId:string,enabled:boolean){
  return useQuery({queryKey:['pm-project-access-preview',projectId],enabled,queryFn:async()=>{
    const {data,error}=await supabase.rpc('pm_preview_project_access',{_project:projectId});if(error)throw error;
    return data as unknown as {active:boolean;rows:ProjectAccessRow[]};
  }});
}
export function useChangeProjectAccess(projectId:string){
  const qc=useQueryClient();return useMutation({mutationFn:async(input:{row:ProjectAccessRow;area:ProjectAccessArea;reason:string})=>{
    const {data,error}=await supabase.rpc('pm_change_project_access',{_project:projectId,_resource:input.row.resource_id,_flags:{[input.area]:!input.row[input.area]},_revision:input.row.revision,_reason:input.reason});if(error)throw error;return data;
  },onSuccess:()=>qc.invalidateQueries({queryKey:['pm-project-access-preview',projectId]})});
}