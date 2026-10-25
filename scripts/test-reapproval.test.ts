import { describe, expect, it } from 'vitest';
import { approvalActions } from '../src/lib/marketing/approval-state';
describe('stale approval recovery', () => {
  for (const status of ['failed', 'approved', 'scheduled']) {
    it(`${status} stale content requires approval instead of publishing`, () => {
      expect(approvalActions(status, false, false)).toEqual({ needsReapproval: true, canApprove: true, canPublish: false });
    });
    it(`${status} valid content can publish without reapproval`, () => {
      expect(approvalActions(status, true, false)).toEqual({ needsReapproval: false, canApprove: false, canPublish: true });
    });
  }
  it('never recovers sent or locked evidence', () => {
    expect(approvalActions('failed', false, true).canApprove).toBe(false);
    expect(approvalActions('failed', true, true).canPublish).toBe(false);
  });
  it('unsaved content hides publishing', () => {
    expect(approvalActions('approved', true, false, true).canPublish).toBe(false);
  });
  it('published and publishing are never recoverable', () => {
    for (const status of ['published', 'publishing']) expect(approvalActions(status, false, false).canApprove).toBe(false);
  });
});