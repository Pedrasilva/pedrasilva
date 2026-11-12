import { numberStages, constructionStageIds } from '@/lib/quotes/stage-numbering';
import type { LiveStage } from './live-data';
import { relativeProgrammeRows } from './relative-programme';

export const GANTT_MIN_FONT_PT = 8;
export const GANTT_ROWS_PER_SHEET = 22;
export type DocumentGanttRow = { id: string; name: string; number: string; start: number; end: number; duration: string | number; construction: boolean; group: boolean; depth: number };

/** Display-only model; keeps WBS order and never mutates live stage dates. */
export function documentGanttRows(stages: LiveStage[], kind: string, parentId?: string, override?: unknown): DocumentGanttRow[] {
  const mapped = stages.filter(s => s.isSelf).map(s => ({ ...s, sort_order: s.sortOrder, parent_stage_id: s.parentStageId }));
  const ordered = numberStages(mapped);
  const construction = constructionStageIds(mapped);
  // Document legacy groups can be named simply "Construction"/"Obra".
  for (const s of mapped) if (/^(construction|obra|construção)$/i.test(s.name.trim()) || /concurso.*constru[cç]|construction.*tender/i.test(s.name)) construction.add(s.id);
  for (let i=0;i<mapped.length;i++) for(const s of mapped) if(s.parentStageId && construction.has(s.parentStageId)) construction.add(s.id);
  const optional = new Set(mapped.filter(s => s.isOptional).map(s => s.id));
  for (let i = 0; i < mapped.length; i++) for (const s of mapped) if (s.parentStageId && optional.has(s.parentStageId)) optional.add(s.id);
  const descendants = new Set(parentId ? [parentId] : []);
  if (parentId) for (let i = 0; i < mapped.length; i++) for (const s of mapped) if (s.parentStageId && descendants.has(s.parentStageId)) descendants.add(s.id);
  const relative = relativeProgrammeRows(override);
  if (relative.length) return relative.map(r => ({ id:r.stageId, name:r.label, number:ordered.find(n=>n.stage.id===r.stageId)?.number ?? '', start:(r.start-1)*(r.unit==='week'?7:30)*86400000, end:r.end*(r.unit==='week'?7:30)*86400000, duration:r.durationLabel, construction:r.unit==='constructionMonth', group:false, depth:0 }));
  const children = new Set(mapped.map(s=>s.parentStageId).filter(Boolean));
  const rows = ordered.filter(({stage:s}) => !optional.has(s.id) && s.startDate && s.endDate).map(({stage:s,number,depth}) => ({id:s.id,name:s.name,number,depth,start:Date.parse(s.startDate ?? ''),end:Date.parse(s.endDate ?? ''),duration:s.durationDays ?? 0,construction:construction.has(s.id),group:children.has(s.id)})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end));
  // Roll up copied numeric ranges only, not the caller's shared snapshot.
  for (const row of [...rows].reverse()) {
    const pid = mapped.find(s=>s.id===row.id)?.parentStageId;
    const parent = rows.find(r=>r.id===pid);
    if(parent){parent.start=Math.min(parent.start,row.start);parent.end=Math.max(parent.end,row.end);}
  }
  return rows.filter(r => kind==='gantt_design' ? !r.construction : kind==='gantt_construction' ? r.construction : kind==='gantt_partial' && parentId ? descendants.has(r.id) : true);
}

export function documentGanttSheets(rows: DocumentGanttRow[]) {
  if(rows.length<=GANTT_ROWS_PER_SHEET) return [rows];
  const groups=[rows.filter(r=>!r.construction),rows.filter(r=>r.construction)].filter(g=>g.length);
  return groups.flatMap(g=>Array.from({length:Math.ceil(g.length/GANTT_ROWS_PER_SHEET)},(_,i)=>g.slice(i*GANTT_ROWS_PER_SHEET,(i+1)*GANTT_ROWS_PER_SHEET)));
}