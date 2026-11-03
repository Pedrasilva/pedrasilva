import {describe,it,expect} from 'vitest';
import {displayPaymentDate} from '../src/lib/projects/payment-timing';
describe('payment date safety',()=>{
  it('does not display placeholder dates from 2000',()=>{expect(displayPaymentDate('2000-01-03','en')).toBeNull();});
  it('does not invent dates for missing evidence',()=>{expect(displayPaymentDate(null,'en')).toBeNull();});
  it('keeps an explicit calendar date without a UTC day shift',()=>{expect(displayPaymentDate('2026-06-01','en')).toBe('Jun 01, 2026');});
});