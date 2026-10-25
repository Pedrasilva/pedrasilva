export const REEL_RETENTION_DAYS = 30;
export type ReelRetentionDraft = {
  format: string | null; status: string; ig_media_id: string | null; published_at: string | null;
  ig_published_at?: string | null; publish_lock_id?: string | null; publish_retry_at?: string | null;
  publish_error_code?: string | null; publish_error_message?: string | null; video_purged_at?: string | null;
};

/** Mirrors the database's conservative service-only candidate predicate. */
export function reelVideoPurgeDue(d: ReelRetentionDraft, now = new Date()): boolean {
  if (d.format !== 'reel' || d.status !== 'published' || !d.ig_media_id?.trim() || !d.published_at ||
    d.publish_lock_id || d.publish_retry_at || d.publish_error_code || d.publish_error_message || d.video_purged_at) return false;
  const publication = Date.parse(d.published_at);
  const exactPublication = d.ig_published_at ? Date.parse(d.ig_published_at) : publication;
  return Number.isFinite(publication) && Number.isFinite(exactPublication) &&
    now.getTime() >= Math.max(publication, exactPublication) + REEL_RETENTION_DAYS * 86400_000;
}

export function isReelVideoPath(uploadId: string, path: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId) &&
    (path === `reels/${uploadId}/video.mp4` || path === `reels/${uploadId}/video.mov`);
}