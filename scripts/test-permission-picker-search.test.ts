import { describe, expect, it } from 'vitest';
import { matchesPickerSearch } from '../src/lib/permission-picker-search';

describe('permission picker display search', () => {
  it('matches accented person names without accents', () => {
    expect(matchesPickerSearch('conceicao', ['Ricardo Conceição'])).toBe(true);
    expect(matchesPickerSearch('irene', ['Ricardo Conceição'])).toBe(false);
  });
  it('matches PT and EN names and sections independently of UI locale', () => {
    const labels = ['Aprovar folhas de horas', 'Folhas de horas', 'Approve timesheets', 'Timesheets'];
    expect(matchesPickerSearch('timesheets approve', labels)).toBe(true);
    expect(matchesPickerSearch('FOLHAS', labels)).toBe(true);
    expect(matchesPickerSearch('finance banking', labels)).toBe(false);
  });
});