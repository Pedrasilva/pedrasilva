import { addDays, format, parseISO } from "date-fns";
import { deriveSlots, type BoardData, type BoardStage, type DerivedBoard, type DraftSlot, type DayPart } from "./week-board";

export const slotKey = (s: Pick<DraftSlot, "resource_id" | "day" | "part">) => `${s.resource_id}/${s.day}/${s.part}`;
export const slotValue = (s: DraftSlot | undefined) => s ? { project_id: s.project_id, stage_id: s.stage_id, is_site_visit: s.is_site_visit } : null;
export const sameSlot = (a: DraftSlot | undefined, b: DraftSlot | undefined) => JSON.stringify(slotValue(a)) === JSON.stringify(slotValue(b));
export function explicitSlots(board: DerivedBoard): DraftSlot[] {
  return Object.entries(board).flatMap(([resource_id, days]) => Object.entries(days).flatMap(([day, cell]) => (["am", "pm"] as DayPart[]).flatMap(part => {
    const s = cell[part]; return !cell.leave && s ? [{ resource_id, day, part, project_id:s.projectId, stage_id:s.stageId, is_site_visit:s.isSiteVisit }] : [];
  })));
}
export function draftBoard(data: BoardData, week: string, slots: DraftSlot[]): DerivedBoard {
  const board = deriveSlots([], week, Object.fromEntries(data.resources.map(r => [r.id, 8])), data.leave);
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
}