import { describe, expect, it } from 'vitest';
import { expenseFormValues, ExpenseReceiptFiles } from '../src/lib/finance/expense-form-state';

describe('scanned receipt reset', () => {
  const intake = { id: 'qa-queue', supplier: 'QA Scan Supplier', documentNumber: 'QA-SCAN-1104', date: '2026-11-02', currency: 'USD', amount: 42.75, path: 'qa-only/receipt.pdf' };
  for (const [field, expected] of Object.entries({ supplier: 'QA Scan Supplier', documentNumber: 'QA-SCAN-1104', date: '2026-11-02', currency: 'USD', originalAmount: '42.75', receiptPath: 'qa-only/receipt.pdf' })) {
    it(`preserves scanned ${field} on reset`, () => {
      expect(expenseFormValues(null, 'qa-project', intake, '2026-11-04')[field]).toBe(expected);
    });
  }
  it('keeps default date when scan date is absent', () => expect(expenseFormValues(null, 'qa-project', { ...intake, date: null }, '2026-11-04').date).toBe('2026-11-04'));
  it('starts a clean form without scan evidence', () => expect(expenseFormValues(null, 'qa-project', undefined, '2026-11-04').receiptPath).toBe(''));
});
describe('receipt reuse', () => {
  it('reuses the same dropped file path and hash', () => {
    const files = new ExpenseReceiptFiles(); const file = new File(['QA'], 'receipt.pdf');
    files.remember(file, 'qa-project', { path: 'qa-only/receipt.pdf', hash: 'qa-hash' });
    expect(files.get(file, 'qa-project')).toEqual({ path: 'qa-only/receipt.pdf', hash: 'qa-hash' });
  });
  it('never reuses evidence for another file or project', () => {
    const files = new ExpenseReceiptFiles(); const file = new File(['QA'], 'receipt.pdf');
    files.remember(file, 'qa-project', { path: 'qa-only/receipt.pdf', hash: 'qa-hash' });
    expect(files.get(file, 'different-project')).toBeUndefined();
    expect(files.get(new File(['QA'], 'receipt.pdf'), 'qa-project')).toBeUndefined();
  });
});