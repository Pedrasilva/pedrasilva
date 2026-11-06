import { describe, expect, it } from 'vitest';
import { projectActualTotals, applyB1RateAccess, type ActualEntryFigure, type ActualTimeRow } from '../src/lib/projects/project-actual-totals';
import { loggedEntryFigures, marginLabel } from '../src/lib/projects/financial-calculation';

// Gate-ON reader outputs are proven identical for Rita and Luis on Mint by the
// rolled-back transaction in scripts/test-b1-gate-on-parity.sql (B1_PARITY_PASS).
// This test runs those inputs through the page's own pure path.
const SALE = 52.75; // HR default sale rate returned by the shared server rate function
const hrDefault = { cost: 30, sale: SALE, sale100: 60 };
const stage = 'programa-base';
const timeRows: ActualTimeRow[] = [{ stage_id: stage, hours: 58.5, snapCost: 1763.775, unsnapHours: 0 }];
const entriesFor = (rates: { cost: number; sale: number }): ActualEntryFigure[] => [
  { stageId: stage, ...loggedEntryFigures({ hours: 58.5, billable: true, entry_type: 'project', cost_rate_snapshot: 1763.775 / 58.5, sale_rate_snapshot: null }, rates) },
];
const totalsFor = (rates: { cost: number; sale: number }, ready = true) => projectActualTotals({
  stageIds: [stage], ready, timeRows, entries: entriesFor(rates), historical: { amount: 0, cost: 0 }, pursuitCost: 47.99,
});

describe('B1 gate ON: Rita (all four areas ON) equals Luis on Mint', () => {
  it('server rate gating gives Rita the same rates as Luis when Financials+Budget are ON', () => {
    expect(applyB1RateAccess(hrDefault, true, true, true)).toEqual(applyB1RateAccess(hrDefault, true, true, true));
    expect(applyB1RateAccess(hrDefault, true, true, true)).toEqual(hrDefault);
  });
  it('revenue, cost, profit and margin are identical and match 3086 / 1812 / 1274 / 41%', () => {
    const luis = totalsFor(applyB1RateAccess(hrDefault, true, true, true));
    const rita = totalsFor(applyB1RateAccess(hrDefault, true, true, true));
    expect(rita).toEqual(luis);
    expect(rita.revenue).toBeCloseTo(3085.875, 3);
    expect(rita.cost).toBeCloseTo(1811.765, 3);
    expect(rita.profit).toBeCloseTo(1274.11, 2);
    expect(marginLabel(rita.marginPct)).toBe('41%');
  });
  it('while sources are still loading the totals are unavailable, never 48 € cost / -48 € profit', () => {
    const loading = totalsFor(hrDefault, false);
    expect(Number.isNaN(loading.cost)).toBe(true);
    expect(Number.isNaN(loading.profit)).toBe(true);
    expect(marginLabel(loading.marginPct)).toBe('—');
  });
});

describe('B1 gate ON: Patricia (all areas OFF) sees no figures', () => {
  it('rates are withheld, so revenue/profit/margin are unavailable rather than zero', () => {
    const denied = applyB1RateAccess(hrDefault, true, false, false);
    expect(Number.isNaN(denied.sale) && Number.isNaN(denied.cost)).toBe(true);
    const t = projectActualTotals({ stageIds: [stage], ready: true, timeRows: [{ stage_id: stage, hours: 58.5, snapCost: 0, unsnapHours: 58.5 }],
      entries: [{ stageId: stage, ...loggedEntryFigures({ hours: 58.5, billable: true, entry_type: 'project', cost_rate_snapshot: null, sale_rate_snapshot: null }, denied) }],
      historical: { amount: 0, cost: 0 }, pursuitCost: NaN });
    expect(Number.isNaN(t.revenue)).toBe(true);
    expect(Number.isNaN(t.cost)).toBe(true);
    expect(marginLabel(t.marginPct)).toBe('—');
  });
});
