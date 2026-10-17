import { supabase } from "@/integrations/supabase/client";
import { recomputeSchedule, scheduleCalendar, RELATIVE_ORIGIN, type ScheduleState, type SchedulePatch } from "./schedule-engine";
import type { StageDependency } from "./dependencies";

type Mode = "quote" | "project";
interface History { before: ScheduleState; after: ScheduleState }
const histories = new Map<string, {undo: History[]; redo: History[]}>();
const db = supabase as unknown as {rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: {message: string} | null}>};
export async function readGanttSchedule(mode: Mode, scope: string): Promise<ScheduleState> {
  const {data,error} = await db.rpc("pm_gantt_state", {_mode:mode,_scope:scope});
  if (error) throw new Error(error.message);
  return data as ScheduleState;
}
export async function saveGanttSchedule(mode: Mode, scope: string, state: ScheduleState, patch: SchedulePatch,
  initialize = false, history = true): Promise<History> {
  const {data,error} = await db.rpc("pm_gantt_save", {_mode:mode,_scope:scope,_revision:state.revision,_patch:patch,_initialize:initialize});
  if (error) throw new Error(error.message);
  const result = data as History;
  if (history) {
    const key = `${mode}:${scope}`;
    const stack = histories.get(key) ?? {undo:[],redo:[]};
    stack.undo.push(result); stack.redo=[]; histories.set(key,stack);
  }
  return result;
}
export async function changeGanttStage(mode: Mode, scope: string, id: string, start_date: string, end_date: string) {
  const state = await readGanttSchedule(mode,scope);
  const patch = recomputeSchedule(state,state.dependencies,[{id,start_date,end_date}]);
  await saveGanttSchedule(mode,scope,state,patch);
  return {updatedIds:patch.stages.map(s=>s.id), shiftedAllocations:patch.allocations.length,
    dependentCount:patch.stages.filter(s=>s.id!==id).length};
}
export async function changeGanttAllocationDates(mode: Mode, scope: string, id: string, dates: {start_date?:string;end_date?:string}) {
  const state=await readGanttSchedule(mode,scope);
  const allocation=state.allocations.find(a=>a.id===id);
  if (!allocation) throw new Error("gantt.schedule.stale");
  if (allocation.is_locked || allocation.external_id || ["import","imported_accelo"].includes(allocation.source ?? "")) throw new Error("gantt.schedule.lockedAllocation");
  const calendar=scheduleCalendar(state.relative?[]:state.holidays);
  const start_date=calendar.snap(dates.start_date ?? allocation.start_date);
  const end_date=calendar.snap(dates.end_date ?? allocation.end_date,-1);
  if (end_date<start_date) throw new Error("gantt.schedule.invalidRange");
  return saveGanttSchedule(mode,scope,state,{stages:[],allocations:[{id,start_date,end_date}],dependencies:state.dependencies});
}
export async function changeGanttDependency(mode: Mode, scope: string, action: "create" | "update" | "delete",
  input: Partial<StageDependency> & {id?: string; replaces?: string}) {
  const state = await readGanttSchedule(mode,scope);
  const old = state.dependencies.find(d=>d.id===input.id);
  let deps = state.dependencies.filter(d => d.id !== input.replaces && (action !== "delete" || d.id !== input.id));
  let next = old;
  if (action === "create") {
    if (!input.predecessor_id || !input.successor_id) throw new Error("gantt.schedule.invalidLink");
    const existing = deps.find(d=>d.predecessor_id===input.predecessor_id && d.successor_id===input.successor_id);
    next = {id:existing?.id ?? crypto.randomUUID(),predecessor_id:input.predecessor_id,successor_id:input.successor_id,
      type:input.type ?? "FS",lag_days:input.lag_days ?? 0};
    deps = [...deps.filter(d=>d.id!==next?.id),next];
  } else if (action === "update") {
    if (!old) throw new Error("gantt.schedule.stale");
    next = {...old,...input}; deps=deps.map(d=>d.id===old.id ? next as StageDependency : d);
  }
  const root = next?.successor_id ?? old?.successor_id;
  const patch = recomputeSchedule(state,deps,[],root ? [root] : []);
  await saveGanttSchedule(mode,scope,state,patch);
  if(mode==="quote" && next && action!=="delete") {
    const {data,error}=await supabase.from("quote_stage_dependencies").select("*").eq("id",next.id).single();
    if(error)throw error;return data;
  }
  return next;
}
export async function projectScopeForDependency(input: {id?: string; predecessor_id?: string}): Promise<string> {
  let stageId = input.predecessor_id;
  if (!stageId && input.id) {
    const {data,error} = await supabase.from("pm_stage_dependencies").select("predecessor_id").eq("id",input.id).single();
    if (error) throw error;
    stageId = data.predecessor_id;
  }
  if (!stageId) throw new Error("gantt.schedule.invalidLink");
  const {data,error} = await supabase.from("pm_stages").select("project_id").eq("id",stageId).single();
  if (error) throw error;
  return data.project_id;
}
export async function undoGanttSchedule(mode: Mode, scope: string, redo = false) {
  const stack = histories.get(`${mode}:${scope}`);
  const item = (redo ? stack?.redo : stack?.undo)?.at(-1);
  if (!stack || !item) return;
  const current = await readGanttSchedule(mode,scope);
  const expected = redo ? item.before : item.after;
  if (current.revision !== expected.revision) throw new Error("gantt.schedule.stale");
  const target = redo ? item.after : item.before;
  const changedStages = new Set(item.before.stages.filter(s=> {
    const after=item.after.stages.find(a=>a.id===s.id);
    return after?.start_date!==s.start_date || after?.end_date!==s.end_date;
  }).map(s=>s.id));
  const changedAllocs = new Set(item.before.allocations.filter(a=> {
    const after=item.after.allocations.find(s=>s.id===a.id);
    return after?.start_date!==a.start_date || after?.end_date!==a.end_date;
  }).map(a=>a.id));
  const result = await saveGanttSchedule(mode,scope,current,{stages:target.stages.filter(s=>changedStages.has(s.id)),
    allocations:target.allocations.filter(a=>changedAllocs.has(a.id)),dependencies:target.dependencies},false,false);
  if (redo) {
    stack.redo.pop(); stack.undo.push({before:result.before,after:result.after});
    const next = stack.redo.at(-1);
    if (next) next.before = {...next.before,revision:result.after.revision};
  } else {
    stack.undo.pop(); stack.redo.push({before:result.after,after:item.after});
    const previous = stack.undo.at(-1);
    if (previous) previous.after = {...previous.after,revision:result.after.revision};
  }
}
export function relativeInitialization(state: ScheduleState, dependencies = state.dependencies): SchedulePatch {
  const calendar = scheduleCalendar();
  const first = state.stages.reduce((s,v)=>v.start_date<s ? v.start_date:s,state.stages[0]?.start_date ?? RELATIVE_ORIGIN);
  const map = (date: string) => calendar.shift(RELATIVE_ORIGIN,calendar.offset(calendar.snap(first),calendar.snap(date)));
  const normalized = {...state,dependencies,relative:true,stages:state.stages.map(s=>({...s,start_date:map(s.start_date),
    end_date:calendar.shift(map(s.start_date),calendar.duration(s.start_date,s.end_date)-1)})),
    allocations:state.allocations.map(a=>({...a,start_date:map(a.start_date),end_date:map(a.end_date)}))};
  const computed = recomputeSchedule(normalized,normalized.dependencies,[],normalized.stages.map(s=>s.id));
  return {stages:normalized.stages.map(s=>computed.stages.find(c=>c.id===s.id) ?? s),
    allocations:normalized.allocations.map(a=>computed.allocations.find(c=>c.id===a.id) ?? a),dependencies:normalized.dependencies};
}