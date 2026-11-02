import { describe, it, expect } from 'vitest';
import { expenseClientAmount, expenseCost, receiptNet } from '../src/lib/finance/expense-amounts';
describe('project expense rules', () => {
  it('at cost bills exactly the EUR cost', () => expect(expenseClientAmount(100, 'cost', 20)).toBe(100));
  it('markup adds the configured percentage', () => expect(expenseClientAmount(100, 'markup', 20)).toBe(120));
  it('non-rebillable has no client amount', () => expect(expenseClientAmount(100, 'none', 20)).toBe(0));
  it('missing EUR does not assume a free expense', () => expect(expenseCost({ workflow_version: 2, eur_amount: null, purchase_price: 0 })).toBeNaN());
  it('new flow uses actual card EUR', () => expect(expenseCost({ workflow_version: 2, eur_amount: 118.2, purchase_price: 120 })).toBe(118.2));
  it('historical cost remains unchanged', () => expect(expenseCost({ workflow_version: 1, purchase_price: 123 })).toBe(123));
  it('partial receipt excludes proportional VAT', () => expect(receiptNet(61.5, 100, 23)).toBe(50));
  it('full receipt does not create a negative net balance', () => expect(100 - receiptNet(123, 100, 23)).toBe(0));
});