import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Approved payment offset manifest', () => {
  const lines = readFileSync('docs/project-access-phase-a/payment-terms-offset-review.csv', 'utf8').trim().split(/\r?\n/).slice(1);
  it('contains exactly 96 unique reviewed payment rows', () => {
    expect(lines).toHaveLength(96);
    expect(new Set(lines.map(line => line.split(',')[0])).size).toBe(96);
  });
  it('approves exactly 30 days from a previous zero offset for every row', () => {
    for (const line of lines) {
      const columns = line.split(',');
      expect(Number(columns[5])).toBe(0);
      expect(Number(columns[8])).toBe(30);
    }
  });
});