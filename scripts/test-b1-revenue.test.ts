import { describe, expect, it } from 'vitest';
import { loggedEntryFigures, marginPercentage } from '../src/lib/projects/financial-calculation';
import { permittedNumber } from '../src/lib/projects/b1-projection';

describe('B1 authorized earned revenue, distinct from contract fee', () => {
  const entry = { hours: 8, billable: true, entry_type: 'project', cost_rate_snapshot: 30, sale_rate_snapshot: null };
  it('all four ON values missing sale snapshots from authorized author pricing', () => {
    const figures = loggedEntryFigures(entry, { sale: 50, cost: 30 });
    expect(figures.value).toBe(400);
    expect(figures.cost).toBe(240);
    expect(figures.profit).toBe(160);
    expect(marginPercentage(figures.value, figures.profit, [true,true,true,true])).toBe(40);
  });
  it('partial access never invents denied revenue or integrated margin', () => {
    const figures = loggedEntryFigures(entry, { sale: permittedNumber(50,false), cost:30 });
    expect(Number.isNaN(figures.value)).toBe(true);
    expect(marginPercentage(400,160,[true,true,false,true])).toBeNull();
  });
  it('all OFF does not turn financial values into zero', () => {
    const figures = loggedEntryFigures({...entry,cost_rate_snapshot:null}, {sale:permittedNumber(50,false),cost:permittedNumber(30,false)});
    expect(Number.isNaN(figures.value)).toBe(true);
    expect(Number.isNaN(figures.cost)).toBe(true);
    expect(figures.marginPct).toBeNull();
  });
  it('zero or missing revenue has no margin', () => {
    expect(marginPercentage(0,-240)).toBeNull();
    expect(marginPercentage(null,160)).toBeNull();
  });
});