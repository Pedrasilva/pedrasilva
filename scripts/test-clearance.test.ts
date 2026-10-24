import { describe, it, expect } from 'vitest';
import { canRecheckClearance } from '../src/lib/marketing/clearance';
describe('Unpublished clearance recheck', () => {
  for (const status of ['suggested','pending_approval','approved','scheduled','failed']) {
    it(`rechecks ${status}`, () => expect(canRecheckClearance(status)).toBe(true));
  }
  for (const status of ['published','publishing','rejected']) {
    it(`does not mutate ${status}`, () => expect(canRecheckClearance(status)).toBe(false));
  }
});