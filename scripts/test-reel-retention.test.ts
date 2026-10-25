import { describe, it, expect, vi } from 'vitest';
import { reelVideoPurgeDue, isReelVideoPath, type ReelRetentionDraft } from '../src/lib/marketing/reel-retention';
import { cleanupPublishedReelVideos } from '../src/lib/marketing/reel-retention.server';
import { resolveDraftImages } from '../src/lib/marketing/draft-images';

const id = '00000000-0000-4000-8000-000000000030';
const base: ReelRetentionDraft = { format: 'reel', status: 'published', ig_media_id: 'fixture-instagram', published_at: '2026-09-25', ig_published_at: '2026-09-25T12:00:00Z' };
const now = new Date('2026-10-25T12:00:00Z');
describe('published reel retention', () => {
  it('becomes due at exactly 30 days after successful publication, not a millisecond earlier', () => {
    expect(reelVideoPurgeDue(base, now)).toBe(true);
    expect(reelVideoPurgeDue(base, new Date(now.getTime() - 1))).toBe(false);
  });
  for (const status of ['suggested', 'approved', 'scheduled', 'failed', 'publishing', 'rejected']) {
    it(`never purges ${status} reels`, () => expect(reelVideoPurgeDue({ ...base, status }, now)).toBe(false));
  }
  it('requires a confirmed Instagram media ID', () => expect(reelVideoPurgeDue({ ...base, ig_media_id: null }, now)).toBe(false));
  it('requires published_at', () => expect(reelVideoPurgeDue({ ...base, published_at: null }, now)).toBe(false));
  it('never purges uncertain locked/error/retry outcomes', () => {
    for (const patch of [{ publish_lock_id: 'lock' }, { publish_retry_at: now.toISOString() }, { publish_error_code: 'unknown' }, { publish_error_message: 'uncertain' }]) expect(reelVideoPurgeDue({ ...base, ...patch }, now)).toBe(false);
  });
  for (const format of ['single', 'carousel', 'story', null]) {
    it(`never purges ${format} media`, () => expect(reelVideoPurgeDue({ ...base, format }, now)).toBe(false));
  }
  it('never repeats a completed purge', () => expect(reelVideoPurgeDue({ ...base, video_purged_at: now.toISOString() }, now)).toBe(false));
  it('permits only the upload’s exact MP4/MOV full-size video path', () => {
    expect(isReelVideoPath(id, `reels/${id}/video.mp4`)).toBe(true);
    expect(isReelVideoPath(id, `reels/${id}/video.mov`)).toBe(true);
    for (const path of [`reels/${id}/cover.jpg`, `${id}/photo.jpg`, `${id}/story-render/frame.jpg`, `reels/${id}/../video.mp4`]) expect(isReelVideoPath(id, path)).toBe(false);
  });
});

function fixtureDb({ eligible = true, removalFails = false, completeFails = false } = {}) {
  const remove = vi.fn().mockResolvedValue({ error: removalFails ? { message: 'fixture failure' } : null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'marketing_claim_reel_cleanup' ? [{ upload_id: id, video_path: `reels/${id}/video.mp4`, claim_id: id, purged_bytes: 12345 }] : name === 'marketing_reel_purge_eligible' ? eligible : !completeFails }));
  const db = { rpc, storage: { from: vi.fn(() => ({ remove })) }, from: vi.fn(() => ({ select: () => ({ contains: async () => ({ data: [{ id }] }) }), insert })) };
  return { db, rpc, remove, insert };
}
describe('cleanup storage sequence with disposable mock fixtures', () => {
  it('removes one video only, then records completion/size, keeping every other file', async () => {
    const f = fixtureDb();
    const result = await cleanupPublishedReelVideos(f.db as never);
    expect(f.remove).toHaveBeenCalledExactlyOnceWith([`reels/${id}/video.mp4`]);
    expect(f.rpc.mock.calls.map(c => c[0])).toEqual(['marketing_claim_reel_cleanup', 'marketing_reel_purge_eligible', 'marketing_complete_reel_purge']);
    expect(result).toEqual({ candidates: 1, purged: 1, failed: 0, bytes: 12345 });
  });
  it('rechecks eligibility before deletion', async () => {
    const f = fixtureDb({ eligible: false }); await cleanupPublishedReelVideos(f.db as never);
    expect(f.remove).not.toHaveBeenCalled(); expect(f.insert).toHaveBeenCalled();
  });
  it('never marks purge complete if Storage deletion fails and logs failure', async () => {
    const f = fixtureDb({ removalFails: true }); const result = await cleanupPublishedReelVideos(f.db as never);
    expect(f.rpc.mock.calls.map(c => c[0])).not.toContain('marketing_complete_reel_purge');
    expect(result.purged).toBe(0); expect(f.insert).toHaveBeenCalled();
  });
  it('does not claim recorded success when completion fails', async () => {
    const f = fixtureDb({ completeFails: true }); expect((await cleanupPublishedReelVideos(f.db as never)).failed).toBe(1);
  });
  it('a daily-gate skip performs no storage deletion', async () => {
    const f = fixtureDb(); f.rpc.mockResolvedValueOnce({ error: null, data: [] });
    expect(await cleanupPublishedReelVideos(f.db as never)).toEqual({ candidates: 0, purged: 0, failed: 0, bytes: 0 });
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('resolves a purged reel to its retained cover even without a preview size', async () => {
    const from = vi.fn((table: string) => ({ select: () => ({ in: async () => ({ data: table === 'marketing_reel_uploads' ? [{ id, video_path: `reels/${id}/video.mp4`, cover_path: `reels/${id}/cover.jpg`, file_name: 'fixture.mp4', mime_type: 'video/mp4', video_purged_at: now.toISOString() }] : [] }) }) }));
    const rows = await resolveDraftImages({ from }, [id], 3600, { sign: false });
    expect(rows[0]?.storage_path).toBe(`reels/${id}/cover.jpg`);
    expect(rows[0]?.mime_type).toBe('image/jpeg');
    expect(rows[0]?.video_purged_at).toBe(now.toISOString());
  });
});