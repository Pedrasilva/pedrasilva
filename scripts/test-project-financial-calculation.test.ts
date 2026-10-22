import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/lib/projects/use-default-rates', () => ({
  lockedCostRate: (snapshot: unknown, fallback: number) => snapshot == null ? fallback : Number(snapshot),
}));
import { plannedAllocationFigures, loggedEntryFigures, financialResult, completionForecast } from '../src/lib/projects/financial-calculation';
import { stageActuals } from '../src/lib/reports/budget-consumption';
import { billedProjectAmounts, documentProjectAmounts } from '../src/lib/finance/project-document-figures';

describe('common project financial calculation', () => {
  const allocation = {start_date:'2026-06-01',end_date:'2026-08-31',hours_per_day:0.8};
  const holidays = new Set(['2026-06-04','2026-06-10','2026-06-13','2026-08-15']);
  it('2506 has 51.2 hours, not 73.6 calendar hours', () => {
    const p = plannedAllocationFigures(allocation,{cost:32.55,sale:56.9625},holidays);
    expect(p.hours).toBeCloseTo(51.2);
    expect(p.cost).toBeCloseTo(1666.56);
    expect(p.value).toBeCloseTo(2916.48);
    expect(p.profit).toBeCloseTo(1249.92);
  });
  it('retired planning is zero without discarding saved actuals', () => {
    expect(plannedAllocationFigures({...allocation,planning_removed_at:'2026-10-19'}, {cost:40,sale:70},holidays).hours).toBe(0);
    expect(loggedEntryFigures({hours:8.5,billable:true,cost_rate_snapshot:32.55},{cost:999,sale:56.9625}).cost).toBeCloseTo(276.675);
  });
  it('profit is unrounded value minus cost, not contract fee', () => {
    const f=loggedEntryFigures({hours:8.5,billable:true,cost_rate_snapshot:32.55},{cost:999,sale:56.9625});
    expect(f.profit).toBeCloseTo(207.50625);
    expect(Math.round(f.profit)).toBe(208);
    expect(financialResult(0,277).marginPct).toBeNull();
  });
  it('saved sale takes precedence over current sale', () => {
    expect(loggedEntryFigures({hours:2,billable:true,cost_rate_snapshot:30,sale_rate_snapshot:50},{cost:999,sale:999}).value).toBe(100);
  });
  it('snapshot costs count without allocations, direct stage takes precedence and ids deduplicate', () => {
    const e={id:'entry',user_id:'worker',task_id:'task',pm_stage_id:'stage',hours:2,billable:true,cost_rate_snapshot:30};
    const result=stageActuals({entries:[e,e],taskToStage:new Map([['task','wrong']]),stageById:new Map([['stage',{id:'stage',project_id:'project',allocations:[]}]]),costRateFor:()=>999,saleRateFor:rid=>rid==='actual-worker'?50:999,userToResource:new Map([['worker','actual-worker']])});
    expect(result.get('stage')?.laborCost).toBe(60);
    expect(result.get('stage')?.earnedRevenue).toBe(100);
    expect(result.get('stage')?.loggedHours).toBe(2);
  });
  it('unknown costs and retainer missing snapshots cannot produce numeric profit', () => {
    expect(loggedEntryFigures({hours:2,billable:true},{cost:0,sale:50}).profit).toBeNaN();
    expect(loggedEntryFigures({hours:2,billable:true},{cost:30,sale:50},true).cost).toBeNaN();
  });
  it('nonbillable hours are cost only and leave is not labour cost', () => {
    expect(loggedEntryFigures({hours:2,billable:false,cost_rate_snapshot:30},{cost:30,sale:50}).profit).toBe(-60);
    expect(loggedEntryFigures({hours:8,billable:false,entry_type:'non_working',cost_rate_snapshot:30},{cost:30,sale:50}).cost).toBe(0);
  });
  it('done stages have zero remaining forecast, overconsumption is not capped', () => {
    const f=completionForecast({plannedHours:51.2,plannedCost:1666.56,plannedValue:2916.48,loggedHours:8.5,actualCost:276.675,earnedValue:484.18125,done:true});
    expect(f.remainingHours).toBe(0);
    expect(f.cost).toBe(276.675);
    expect(f.profit).toBeCloseTo(207.50625);
  });
});

describe('fiscal project scope stays distinct from earned profit', () => {
  const doc={id:'invoice',direction:'issued',doc_type:'client_invoice',status:'paid',project_id:'a',subtotal_ex_vat:100};
  it('receipts, shareholder financing and cancelled documents do not count as billed', () => {
    expect(billedProjectAmounts({...doc,doc_type:'receipt'},[]).size).toBe(0);
    expect(billedProjectAmounts({...doc,sales_excluded:true},[]).size).toBe(0);
    expect(billedProjectAmounts({...doc,status:'cancelled'},[]).size).toBe(0);
  });
  it('credits reduce billed with no payment mutation', () => {
    expect(billedProjectAmounts({...doc,doc_type:'client_credit_note'},[]).get('a')).toBe(-100);
  });
  it('explicit project lines override header without double counting', () => {
    const lines=[{document_id:'invoice',project_id:'b',amount_ex_vat:40},{document_id:'invoice',project_id:null,amount_ex_vat:60}];
    expect([...documentProjectAmounts(doc,lines)]).toEqual([['b',40],['a',60]]);
  });
});