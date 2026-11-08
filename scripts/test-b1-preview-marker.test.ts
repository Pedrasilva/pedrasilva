// Server-side forwarding rule for the B1 preview marker. The database half of the rule
// (non-admin marker => normal B1 OFF result, writes never affected) is covered by the
// rolled-back transaction in scripts/test-b1-preview-marker.sql (B1_MARKER_PASS).
import { describe, expect, it } from 'vitest';
import { shouldForwardB1Preview } from '../src/lib/projects/b1-preview-marker';

describe('B1 preview marker forwarding', () => {
  it('non-admin sending the marker is not forwarded (gets the normal OFF result)', () => {
    expect(shouldForwardB1Preview('on', 'Bearer t', false)).toBe(false);
  });
  it('admin with a session is forwarded', () => {
    expect(shouldForwardB1Preview('on', 'Bearer t', true)).toBe(true);
  });
  it('no session or other marker values are never forwarded', () => {
    expect(shouldForwardB1Preview('on', null, true)).toBe(false);
    expect(shouldForwardB1Preview('1', 'Bearer t', true)).toBe(false);
    expect(shouldForwardB1Preview(null, 'Bearer t', true)).toBe(false);
  });
});
