import { describe, expect, it } from 'vitest';
import { annualWorkNumber, restartKey, revisionLetters, workReference } from '../src/lib/crm/work-numbering';
describe('Luis D53 numbering', () => {
  it('uses two year digits and three sequence digits', () => {
    expect(annualWorkNumber(2026, 1)).toBe('26001');
    expect(annualWorkNumber(2026, 19)).toBe('26019');
    expect(annualWorkNumber(2027, 1)).toBe('27001');
  });
  it('never truncates the annual capacity', () => {
    expect(annualWorkNumber(2026, 999)).toBe('26999');
    expect(() => annualWorkNumber(2026, 1000)).toThrow();
  });
  it('leaves the first proposal unlettered', () => expect(workReference('26019')).toBe('26019'));
  it('uses A, B, Z, AA without allocating another number', () => {
    expect([1, 2, 26, 27].map(revisionLetters)).toEqual(['A', 'B', 'Z', 'AA']);
    expect(workReference('26019', '', 1)).toBe('26019A');
  });
  it('preserves legacy numbers', () => {
    expect(workReference('0410B')).toBe('0410B');
    expect(workReference('2616', '', 1)).toBe('2616A');
  });
  it('preserves the original number on restart', () => expect(workReference('22014', restartKey(2026), 1)).toBe('22014-26A'));
  it('distinguishes a second restart in the same year', () => expect(workReference('22014', restartKey(2026, 2))).toBe('22014-26-02'));
  it('keeps the confirmed Greg original identity', () => expect(workReference('2530', restartKey(2026))).toBe('2530-26'));
});