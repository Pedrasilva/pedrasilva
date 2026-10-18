import { addDays, format, parseISO } from "date-fns";
import { dailyHours, deriveSlots, PLAN_UTILISATION, type BoardData, type BoardStage, type DerivedBoard, type DraftSlot, type DayPart, type ExtensionNote } from "./week-board";

export const slotKey = (s: Pick<DraftSlot, "resource_id" | "day" | "part">) => `${s.resource_id}/${s.day}/${s.part}`;
export const slotValue = (s: DraftSlot | undefined) => s ? { project_id: s.project_id, stage_id: s.stage_id, is_site_visit: s.is_site_visit } : null;
export const sameSlot = (a: DraftSlot | undefined, b: DraftSlot | undefined) => JSON.stringify(slotValue(a)) === JSON.stringify(slotValue(b));
export const extensionKey = (n: ExtensionNote) => [n.project_id,n.stage_id,n.resource_id ?? "",n.from ?? "",n.until].join("/");
export const mergeExtensionNotes = (notes: ExtensionNote[]) => [...new Map(notes.map(n => [extensionKey(n),n])).values()];
export function explicitSlots(board: DerivedBoard): DraftSlot[] {
  return Object.entries(board).flatMap(([resource_id, days]) => Object.entries(days).flatMap(([day, cell]) => (["am", "pm"] as DayPart[]).flatMap(part => {
    const s = cell[part]; return !cell.leave && s && !s.parentStage ? [{ resource_id, day, part, project_id:s.projectId, stage_id:s.stageId, is_site_visit:s.isSiteVisit }] : [];
  })));
}
export function draftBoard(data: BoardData, week: string, slots: DraftSlot[]): DerivedBoard {
  const board = deriveSlots([], week, Object.fromEntries(data.resources.map(r => [r.id, 8])), data.leave);
  const original = deriveSlots(data.allocations, week, Object.fromEntries(data.resources.map(r => [r.id, dailyHours(r)])), data.leave, data.stage_tree ?? data.stages);
  for (const [resource, days] of Object.entries(board)) for (const [day, cell] of Object.entries(days)) {
    cell.assignments = [...original[resource][day].assignments];
    for (const slot of [original[resource][day].am, original[resource][day].pm, ...original[resource][day].overload]) {
      if (slot?.parentStage && !cell.assignments.some(a => a.allocationId === slot.allocationId)) cell.assignments.push({ ...slot, hoursPerDay: Number(data.allocations.find(a => a.id === slot.allocationId)?.hours_per_day) });
    }
  }
  for (const s of slots) {
    const cell = board[s.resource_id]?.[s.day];
    if (cell && !cell.leave) cell[s.part] = { projectId:s.project_id, stageId:s.stage_id, isSiteVisit:s.is_site_visit, inferred:false, status:"draft", allocationId:slotKey(s) };
  }
  return board;
}
export function shiftSlots(slots: DraftSlot[], target: BoardData): DraftSlot[] {
  return slots.map(s => { const day=format(addDays(parseISO(s.day), 7), "yyyy-MM-dd"); const eligible=coveringStages(target.stages,s.project_id,day); return { ...s,day,stage_id:eligible.some(stage => stage.id===s.stage_id) ? s.stage_id : eligible.length===1 ? eligible[0].id : null }; }).filter(s => target.resources.some(r => r.id === s.resource_id) && target.projects.some(p => p.id === s.project_id) && !target.leave.some(l => l.resource_id === s.resource_id && l.day === s.day));
}
export function coveringStages(stages: BoardStage[], project: string, day: string) {
  return stages.filter(s => s.project_id === project && s.start_date <= day && s.end_date >= day);
}
export function nearestStage(stages: BoardStage[], project: string, day: string) {
  const distance = (s: BoardStage) => Math.min(Math.abs(Date.parse(s.start_date) - Date.parse(day)), Math.abs(Date.parse(s.end_date) - Date.parse(day)));
  return stages.filter(s => s.project_id === project).sort((a,b) => distance(a) - distance(b))[0];
}
/** Resolve only the days covered by the chosen stage; keep the rest pending. */
export function resolveStageCells(stages: BoardStage[], project: string, cells: Pick<DraftSlot,"resource_id"|"day"|"part">[], chosen: string) {
  const resolved = cells.filter(c => coveringStages(stages,project,c.day).some(s => s.id===chosen));
  const pending = cells.filter(c => !resolved.includes(c));
  return { resolved, pending, candidates: pending[0] ? coveringStages(stages,project,pending[0].day) : [] };
}
export function extensionRange(stage: BoardStage, days: string[], resource_id?: string): ExtensionNote | null {
  if (!days.length) return null;
  const sorted=[...days].sort(); const from=sorted[0]<stage.start_date ? sorted[0] : stage.start_date;
  const until=sorted[sorted.length-1]>stage.end_date ? sorted[sorted.length-1] : stage.end_date;
  return from===stage.start_date && until===stage.end_date ? null : {project_id:stage.project_id,stage_id:stage.id,...(resource_id ? {resource_id} : {}),from,until};
}
/** Attribute omitted hours to their allocation, including partially represented overlaps. */
export function unrepresentedBookings(data: BoardData, board: DerivedBoard) {
  return Object.entries(board).flatMap(([resource_id,days]) => Object.entries(days).flatMap(([day,cell]) => {
    if(cell.leave) return [];
    const half=dailyHours(data.resources.find(r => r.id===resource_id) ?? {weekly_capacity:null})*PLAN_UTILISATION/2;
    return data.allocations.filter(a => a.resource_id===resource_id && a.start_date<=day && a.end_date>=day).flatMap(a => {
      const represented=Number(cell.am?.allocationId===a.id)+Number(cell.pm?.allocationId===a.id);
      const overloaded=cell.overload.some(s => s.allocationId===a.id);
      const subHalf=a.day_part===null && a.hours_per_day<half/2;
      if(!overloaded && !subHalf) return [];
      const hours=Math.max(0,Number(a.hours_per_day)-represented*half);
      return hours>0 ? [{resource_id,day,project_id:a.project_id,stage_id:a.stage_id,hours,allocation_id:a.id}] : [];
    });
  }));
}
export function slotChanges(before: DraftSlot[], after: DraftSlot[]) {
  const a = new Map(before.map(s => [slotKey(s), s])); const b = new Map(after.map(s => [slotKey(s), s]));
  return [...new Set([...a.keys(), ...b.keys()])].filter(k => !sameSlot(a.get(k), b.get(k))).map(k => {
    const s = b.get(k) ?? a.get(k);
    if (!s) throw new Error("Missing slot");
    return { resource_id:s.resource_id, day:s.day, part:s.part, before:slotValue(a.get(k)), after:slotValue(b.get(k)) };
  });
}
export function applySlotChanges(current:DraftSlot[], before:DraftSlot[], after:DraftSlot[]) {
  const values=new Map(current.map(s => [slotKey(s),s]));
  for(const c of slotChanges(before,after)) { if(c.after) values.set(slotKey(c),{resource_id:c.resource_id,day:c.day,part:c.part,...c.after}); else values.delete(slotKey(c)); }
  return [...values.values()];
}/** A slot whose chosen stage does not cover its day (kept, flagged amber, needs an explicit extension). */
export function isOutsideStage(stages: BoardStage[], s: Pick<DraftSlot,"day"|"stage_id">) {
  const stage = s.stage_id ? stages.find(x => x.id === s.stage_id) : undefined;
  return !!stage && (s.day < stage.start_date || s.day > stage.end_date);
}
/** Default stage for a project brush: the single bookable stage overlapping the given days, else null. */
export function defaultStage(stages: BoardStage[], project: string, days: string[]) {
  const sorted=[...days].sort(); if(!sorted.length) return null;
  const hits = stages.filter(s => s.project_id === project && s.start_date <= sorted[sorted.length-1] && s.end_date >= sorted[0]);
  return hits.length === 1 ? hits[0].id : null;
}
/** Change only the stage of the given painted slots, keeping project and site visit. */
export function setSlotStage(slots: DraftSlot[], keys: Set<string>, stageId: string | null) {
  return slots.map(s => keys.has(slotKey(s)) ? { ...s, stage_id: stageId } : s);
}
/** One extension proposal per stage covering every outside-date slot; existing wider proposals are kept. Never applied until ticked at approval. */
export function outsideExtensionNotes(stages: BoardStage[], slots: DraftSlot[], notes: ExtensionNote[]) {
  const byStage = new Map<string,string[]>();
  for (const s of slots) if (isOutsideStage(stages,s)) byStage.set(s.stage_id!, [...(byStage.get(s.stage_id!) ?? []), s.day]);
  let next = [...notes];
  for (const [id, days] of byStage) {
    const stage = stages.find(s => s.id === id)!; const own = next.filter(n => n.stage_id === id && !n.resource_id);
    const from = [stage.start_date, ...days, ...own.map(n => n.from ?? stage.start_date)].sort()[0];
    const until = [stage.end_date, ...days, ...own.map(n => n.until)].sort().at(-1)!;
    if (own.length === 1 && (own[0].from ?? stage.start_date) === from && own[0].until === until) continue;
    next = [...next.filter(n => !(n.stage_id === id && !n.resource_id)), { project_id: stage.project_id, stage_id: id, from, until }];
  }
  return next;
}
/** Stages PSA staff may plan or log on: supplier/consultant stages (is_self=false) are excluded. */
export const bookableStages = <T extends { is_self?: boolean | null }>(stages: T[]) => stages.filter(s => s.is_self !== false);
