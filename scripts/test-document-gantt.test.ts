import { describe, expect, it } from 'vitest';
import { documentGanttSheets, GANTT_ROWS_PER_SHEET, type DocumentGanttRow } from '../src/lib/psa-proposal/document-gantt';

const row=(i:number,construction=false):DocumentGanttRow=>({id:String(i),name:String(i),number:String(i),start:0,end:86400000,duration:1,construction,group:false,depth:0});
describe('document Gantt sheet budgeting',()=>{
  it('keeps a small combined programme on one sheet',()=>{
    const rows=[row(1),row(2,true)];expect(documentGanttSheets(rows)).toEqual([rows]);
  });
  it('splits an oversized programme without regrouping its manual order',()=>{
    const rows=[...Array.from({length:24},(_,i)=>row(i)),...Array.from({length:5},(_,i)=>row(100+i,true))];
    const sheets=documentGanttSheets(rows);expect(sheets.map(s=>s.length)).toEqual([22,7]);
    expect(sheets.flat().map(r=>r.id)).toEqual(rows.map(r=>r.id));
    expect(sheets.every(s=>s.length<=GANTT_ROWS_PER_SHEET)).toBe(true);
    expect(sheets[1].slice(2).every(r=>r.construction)).toBe(true);
  });
});