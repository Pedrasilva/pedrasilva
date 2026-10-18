import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/reports/use-hours-logged";
import { toLocalISODate } from "@/lib/dates";
import { getWorkingCalendarHolidays } from "./gantt-utils";
import { buildGanttActuals, type ActualActivity, type ActualStage, type StageActualAggregate } from "./gantt-actuals";
import { PROJECT_SUMMARY_ID } from "./build-project-gantt-tree";

type RawEntry = { id: string; user_id: string; entry_date: string; hours: number; cost_rate_snapshot?: number | null; task_id: string | null; pm_stage_id: string | null; quote_stage_id: string | null; entry_type: string };
type RawStage = { id: string; parent_stage_id: string | null; budget: number; start_date: string; end_date: string; source_quote_stage_id: string | null; stage_kind: string | null };

/** Existing RLS protects activity detail; privacy-safe RPCs reconcile older full months. */
export function useGanttActuals(projectId: string, enabled: boolean, financials: boolean) {
  const today = toLocalISODate(new Date());
  return useQuery({
    queryKey: ["gantt-actuals", projectId, today, financials],
    enabled: enabled && !!projectId,
    staleTime: 30_000,
    queryFn: async () => {
      const stagesRaw = await fetchAll<RawStage>((a,b) => supabase.from("pm_stages").select("id,parent_stage_id,budget,start_date,end_date,source_quote_stage_id,stage_kind").eq("project_id",projectId).order("id").range(a,b) as never);
      const stageIds = stagesRaw.map(s=>s.id);
      if (!stageIds.length) return buildGanttActuals({stages:[],activities:[],asOf:today,holidays:getWorkingCalendarHolidays(),summaryId:PROJECT_SUMMARY_ID});
      const [allocations, historical, summary, locked] = await Promise.all([
        fetchAll<{id:string;stage_id:string;resource_id:string;start_date:string;end_date:string;hours_per_day:number;allocation_percentage:number|null;planning_removed_at:string|null;tasks:{id:string}[]|{id:string}|null}>(
          (a,b)=>supabase.from("pm_allocations").select("id,stage_id,resource_id,start_date,end_date,hours_per_day,allocation_percentage,planning_removed_at,tasks:pm_tasks(id)").in("stage_id",stageIds).order("id").range(a,b) as never),
        fetchAll<{id:string;entry_date:string;stage_id:string|null;resource_id:string|null;collaborator_id:string|null;billable_hours:number|null;non_billable_hours:number|null;cost?:number|null}>(
          (a,b)=>supabase.from("historical_time_entries").select(`id,entry_date,stage_id,resource_id,collaborator_id,billable_hours,non_billable_hours${financials?",cost":""}`).eq("project_id",projectId).lte("entry_date",today).order("id").range(a,b) as never),
        supabase.rpc("pm_project_stage_hours",{p_project_id:projectId}),
        financials ? supabase.rpc("pm_project_stage_locked_cost",{p_project_id:projectId}) : Promise.resolve({data:[],error:null}),
      ]);
      if (summary.error) throw summary.error;
      if (locked.error) throw locked.error;
      const taskStage = new Map<string,string>();
      allocations.forEach(a=>(Array.isArray(a.tasks)?a.tasks:a.tasks?[a.tasks]:[]).forEach(t=>taskStage.set(t.id,a.stage_id)));
      const quoteStage = new Map(stagesRaw.filter(s=>s.source_quote_stage_id && s.stage_kind!=="retainer_month").map(s=>[s.source_quote_stage_id,s.id]));
      const clauses = [`pm_stage_id.in.(${stageIds.join(",")})`];
      if(taskStage.size) clauses.push(`task_id.in.(${[...taskStage.keys()].join(",")})`);
      if(quoteStage.size) clauses.push(`quote_stage_id.in.(${[...quoteStage.keys()].join(",")})`);
      const select = `id,user_id,entry_date,hours,task_id,pm_stage_id,quote_stage_id,entry_type${financials?",cost_rate_snapshot":""}`;
      const entries = await fetchAll<RawEntry>((a,b)=>supabase.from("pm_time_entries").select(select).or(clauses.join(",")).lte("entry_date",today).order("id").range(a,b) as never);
      const users = [...new Set(entries.map(e=>e.user_id))];
      const mapping = users.length ? await supabase.rpc("pm_list_user_resource_map") : {data:[],error:null};
      if(mapping.error) throw mapping.error;
      const identities = new Map((mapping.data??[]).map(m=>[m.user_id,{resourceId:m.resource_id,name:m.name??""}]));
      const [resources, schedules] = await Promise.all([
        supabase.from("pm_resources_public").select("id,name,collaborator_id"),
        supabase.from("collaborators_directory").select("id,daily_hours"),
      ]);
      if(resources.error) throw resources.error;
      if(schedules.error) throw schedules.error;
      const byResource = new Map((resources.data??[]).map(r=>[r.id,r]));
      const byCollaborator = new Map((resources.data??[]).filter(r=>r.collaborator_id).map(r=>[r.collaborator_id,r]));
      const daily = new Map((schedules.data??[]).map(c=>[c.id,Number(c.daily_hours)||8]));
      const activities: ActualActivity[] = entries.map(e=>{
        const identity = identities.get(e.user_id);
        const stageId = e.pm_stage_id ?? (e.task_id?taskStage.get(e.task_id):undefined) ?? (e.quote_stage_id?quoteStage.get(e.quote_stage_id):undefined) ?? null;
        const rate = e.cost_rate_snapshot == null ? null : Number(e.cost_rate_snapshot);
        const retainer = stagesRaw.find(s=>s.id===stageId)?.stage_kind?.startsWith("retainer");
        return {id:e.id,stageId,personId:identity?.resourceId ?? `user:${e.user_id}`,name:identity?.name??"",resourceId:identity?.resourceId??null,date:e.entry_date,hours:Number(e.hours),cost:rate!=null && Number.isFinite(rate) && (retainer?rate>0:rate>=0)?Number(e.hours)*rate:null};
      });
      historical.forEach(h=>{
        const r = h.resource_id?byResource.get(h.resource_id):h.collaborator_id?byCollaborator.get(h.collaborator_id):undefined;
        activities.push({id:`historical:${h.id}`,stageId:h.stage_id,personId:r?.id??`unattributed:${h.collaborator_id??"unknown"}`,name:r?.name??"",resourceId:r?.id??null,date:h.entry_date,hours:Number(h.billable_hours??0)+Number(h.non_billable_hours??0),cost:h.cost==null?null:Number(h.cost),imported:true});
      });
      const stages: ActualStage[] = stagesRaw.map(s=>({id:s.id,parentId:s.parent_stage_id,budget:Number(s.budget)||0,start:s.start_date,end:s.end_date,plans:allocations.filter(a=>a.stage_id===s.id).map(a=>({id:a.id,resourceId:a.resource_id,start:a.start_date,end:a.end_date,hoursPerDay:Number(a.hours_per_day)||0,percentage:a.allocation_percentage,removed:!!a.planning_removed_at,dailyHours:daily.get(byResource.get(a.resource_id)?.collaborator_id??"")??8}))}));
      const lockedBy = new Map((locked.data??[]).map(l=>[`${l.stage_id}:${l.month}`,{cost:Number(l.snap_cost),missing:Number(l.unsnap_hours)}]));
      const aggregates = new Map<string,StageActualAggregate>();
      let limited = false;
      // RPCs have month granularity. Never use their current/future month as a to-date total.
      // For complete past months, replace only missing RLS coverage, not snapshot-safe raw sums.
      for(const row of summary.data??[]) {
        if(row.month>today.slice(0,7)) continue;
        const projectEntryIds=new Set(entries.filter(e=>e.entry_type==="project").map(e=>e.id));
        const raw = activities.filter(a=>projectEntryIds.has(a.id) && a.stageId===row.stage_id && a.date.slice(0,7)===row.month);
        const rawHours = raw.reduce((n,a)=>n+a.hours,0);
        if(Math.abs(rawHours-Number(row.hours))<0.005) continue;
        limited = true;
        const current = aggregates.get(row.stage_id) ?? {
          logged:activities.filter(a=>a.stageId===row.stage_id).reduce((n,a)=>n+a.hours,0),
          cost:activities.filter(a=>a.stageId===row.stage_id).some(a=>a.cost==null)?null:activities.filter(a=>a.stageId===row.stage_id).reduce((n,a)=>n+(a.cost??0),0),
          missingHours:activities.filter(a=>a.stageId===row.stage_id && a.cost==null).reduce((n,a)=>n+a.hours,0),
        };
        if(row.month<today.slice(0,7)) {
          current.logged += Number(row.hours)-rawHours;
          const lk=lockedBy.get(`${row.stage_id}:${row.month}`);
          const rawCost=raw.reduce((n,a)=>n+(a.cost??0),0);
          if(!lk || lk.missing>0) {current.cost=null;current.missingHours+=lk?.missing??Number(row.hours)-rawHours;}
          else if(current.cost!=null) current.cost += lk.cost-rawCost;
        } else {current.cost=null;current.missingHours+=Math.max(0,Number(row.hours)-rawHours);}
        aggregates.set(row.stage_id,current);
      }
      return buildGanttActuals({stages,activities,asOf:today,holidays:getWorkingCalendarHolidays(),summaryId:PROJECT_SUMMARY_ID,aggregates,limited});
    },
  });
}