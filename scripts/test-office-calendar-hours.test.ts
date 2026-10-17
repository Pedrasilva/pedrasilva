import {describe,it,expect} from "vitest";
import {buildNonWorkingPrefill} from "../src/lib/projects/use-timesheet";
import {totalsFromEntries,shortfallHours} from "../src/lib/projects/use-timesheet-weeks";
// Closure week: Mon 28 Dec 2026 – Fri 1 Jan 2027 (1 Jan is a public holiday).
const holidays=[{data:"2026-12-28",nome:"Fecho"},{data:"2026-12-29",nome:"Fecho"},{data:"2026-12-30",nome:"Fecho"},{data:"2026-12-31",nome:"Fecho"},{data:"2027-01-01",nome:"Ano Novo"}];
const closureFerias=["2026-12-28","2026-12-29","2026-12-30","2026-12-31"].map(d=>({data_inicio:d,data_fim:d,tipo:"ferias",periodo:"dia_inteiro",horas:null}));
const owed=(dailyHours:number,daysPerWeek:number)=>{
  const rows=buildNonWorkingPrefill({weekStart:"2026-12-28",weekEnd:"2027-01-03",dailyHours,vacations:closureFerias,holidays});
  const entries=rows.flatMap(r=>[...r.autoHoursByDate.values()].map(hours=>({entry_type:"non_working",hours,leave_type:r.leave_type})));
  return shortfallHours(totalsFromEntries(entries),dailyHours*daysPerWeek);
};
describe("hours bank in an office-closure week",()=>{
  it("full-time person owes 0 hours",()=>expect(owed(8,5)).toBe(0));
  it("part-time person (4 h/day) owes 0 hours",()=>expect(owed(4,5)).toBe(0));
  it("closure férias are not counted twice on top of the closure day",()=>{
    const rows=buildNonWorkingPrefill({weekStart:"2026-12-28",weekEnd:"2027-01-03",dailyHours:8,vacations:closureFerias,holidays});
    const total=rows.reduce((s,r)=>s+[...r.autoHoursByDate.values()].reduce((a,b)=>a+b,0),0);
    expect(total).toBe(40);
  });
});
