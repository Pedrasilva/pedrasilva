import {describe,it,expect} from 'vitest';
import {retainerEnd,retainerMonths,retainerPaymentDates} from './retainer-schedule';
describe('retainer monthly schedule',()=>{
 it('12 months at 2000 euros create 12 payments totalling 24000',()=>{const dates=retainerPaymentDates('2000-07-24',12);expect(dates).toHaveLength(12);expect(dates.length*2000).toBe(24000);expect(dates[0]).toBe('2000-07-24');expect(dates[1]).toBe('2000-08-01');expect(retainerEnd('2000-07-24',12)).toBe('2001-07-23');});
 it('18 months at 2000 euros have 36000 value and 18 payment dates',()=>{expect(retainerMonths('2000-07-24',retainerEnd('2000-07-24',18))).toBe(18);expect(retainerPaymentDates('2000-07-24',18).length*2000).toBe(36000);});
 it('weekends and closures only push the monthly date without reducing amount or count',()=>{const dates=retainerPaymentDates('2026-12-01',12,['2026-12-01']);expect(dates[0]).toBe('2026-12-02');expect(dates[1]).toBe('2027-01-01');expect(dates).toHaveLength(12);expect(dates.length*2000).toBe(24000);});
});